/**
 * コーチ向け教材選択の生徒単位絞り込み（リリースのセクション9: get_student_available_content_ids）の検証。
 *
 * 【背景】コーチのDialogue Practice割当・Lesson Sprint教材選択はcom_m_contentsのRLSに可視範囲を
 * 委ねていたため、コーチが担当した全生徒のテナント（およびコーチ自身のテナント）の限定公開教材が
 * どの生徒の画面にも表示されていた（ステージング検証で発見）。
 *
 * 【構成】すべて使い捨てデータ（${TAG}付き）で、1人のコーチが別テナントの生徒2名を担当する状態を作る。
 *   - 顧客A（生徒A）/ 顧客B（生徒B）/ 顧客C（コーチ自身）
 *   - 限定公開教材（Dialogue: content_type=3 / Sprint: content_type=2）を顧客A・B・Cそれぞれに1件ずつ、
 *     および非公開(content_scope=9)だが顧客Aにアクセス権がある教材を1件
 *   - 担当関係は status=9(terminated) のcom_m_lesson_scheduleで作る（セッションを生成させないため。
 *     sync_coach_student_relationshipトリガーで担当関係が導出される）
 * 各RPC/RLS操作は実サインインJWTで行い、最後にservice_roleで作成データを削除する（--keep時のみ残す）。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260918-dev/student-scoped-contents-verify.ts --env=dev --tag=scope0924
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import { addDays } from "../../../helpers/dates.ts";
import { writeResultLog, type CheckResult } from "../../../helpers/results.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const KEEP = process.argv.includes("--keep");
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;

const service = await createAdminClient(); // 投入・後始末専用
const checks: CheckResult[] = [];
function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` … ${detail}` : ""}`);
}

console.log(`\n=== コーチ向け教材選択の生徒単位絞り込み検証: env=${env} tag=${TAG} ===`);

// -----------------------------------------------------------------------------
// Preflight: RPCの存在確認（ダミー引数。未反映なら42883）
// -----------------------------------------------------------------------------
{
  const { error } = await service.rpc("get_student_available_content_ids", {
    p_student_id: "00000000-0000-0000-0000-000000000000",
    p_content_type: 3,
  });
  if (error?.code === "42883" || error?.code === "PGRST202") {
    throw new Error("get_student_available_content_ids が未反映です（リリースのセクション9を適用してください）");
  }
}

// -----------------------------------------------------------------------------
// 投入
// -----------------------------------------------------------------------------
const clientNames = {
  a: `【QAテスト】教材公開範囲検証A（${TAG}）`,
  b: `【QAテスト】教材公開範囲検証B（${TAG}）`,
  c: `【QAテスト】教材公開範囲検証C（${TAG}）`,
};
const emails = {
  coach: `${TAG}-scope-coach@gabby-qa-test.example`,
  studentA: `${TAG}-scope-student-a@gabby-qa-test.example`,
  studentB: `${TAG}-scope-student-b@gabby-qa-test.example`,
  otherCoach: `${TAG}-scope-other-coach@gabby-qa-test.example`,
};
const contentLabelPrefix = `qa-scope-${TAG}`;

async function ensureClient(name: string): Promise<string> {
  const { data: existing } = await service.from("com_m_client").select("client_id").eq("client_name", name).maybeSingle();
  if (existing) return existing.client_id as string;
  const { data, error } = await service
    .from("com_m_client")
    .insert({ client_name: name, client_type: 1, industry_type: 1 })
    .select("client_id")
    .single();
  if (error) throw error;
  return data.client_id as string;
}

async function findUserId(email: string): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureUser(email: string, userType: "1" | "2", userName: string, clientId: string): Promise<string> {
  let userId = await findUserId(email);
  if (!userId) {
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error } = await service.from("com_m_user").update({ client_id: clientId, user_type: userType, user_name: userName }).eq("id", userId);
  if (error) throw error;
  return userId;
}

/** 担当関係の導出用に、生徒ごとの契約→ライセンス→チケット→終了済みスケジュールを投入する（冪等） */
async function ensureRelationship(clientId: string, studentId: string, coachId: string): Promise<void> {
  const { data: rel } = await service
    .from("com_m_coach_student_relationship")
    .select("relationship_id")
    .eq("coach_id", coachId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (rel) return;

  const { data: plan, error: pErr } = await service.from("com_m_contract_plan").select("*").eq("plan_code", "LIVE_WEEKLY1_3M").single();
  if (pErr) throw pErr;
  const start = addDays(new Date(), -30);
  const end = addDays(new Date(), 60);
  const { data: contract, error: cErr } = await service
    .from("com_m_contract")
    .insert({
      client_id: clientId,
      plan_name: plan.plan_name,
      plan_name_en: plan.plan_name_en,
      plan_id: plan.plan_id,
      max_licenses: 1,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      status: 1,
      contract_type: plan.contract_type,
      weekly_frequency: plan.weekly_frequency,
      total_sessions: plan.total_sessions,
      has_dialogue_practice: plan.has_dialogue_practice,
      note: `【QAテスト】教材公開範囲検証（${TAG}）`,
    })
    .select("contract_id")
    .single();
  if (cErr) throw cErr;
  const { data: license, error: lErr } = await service
    .from("com_t_user_license")
    .insert({ contract_id: contract.contract_id, user_id: studentId, status: 1, start_date: start.toISOString(), end_date: end.toISOString() })
    .select("license_id")
    .single();
  if (lErr) throw lErr;
  const { data: ticket, error: tErr } = await service
    .from("com_t_user_session_ticket")
    .insert({
      license_id: license.license_id,
      contract_id: contract.contract_id,
      user_id: studentId,
      weekly_frequency: plan.weekly_frequency,
      total_sessions: plan.total_sessions,
      used_sessions: 0,
    })
    .select("ticket_id")
    .single();
  if (tErr) throw tErr;
  const { error: sErr } = await service.from("com_m_lesson_schedule").insert({
    ticket_id: ticket.ticket_id,
    student_id: studentId,
    coach_id: coachId,
    slot_no: 1,
    day_of_week: start.getUTCDay(),
    start_time: "10:00:00",
    end_time: "10:30:00",
    coach_timezone: "Asia/Tokyo",
    status: 9, // terminated: 担当関係のみ導出し、セッションは生成させない
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    target_sessions: 999,
  });
  if (sErr) throw sErr;
}

/** 検証用の教材を投入し、指定顧客へのアクセス権を付与する（冪等。content_labelで識別） */
async function ensureContent(key: string, contentType: 2 | 3, scope: 1 | 9, accessClientId: string): Promise<string> {
  const label = `${contentLabelPrefix}-${key}`;
  const { data: existing } = await service.from("com_m_contents").select("content_id").eq("content_label", label).maybeSingle();
  let contentId = existing?.content_id as string | undefined;
  if (!contentId) {
    const { data, error } = await service
      .from("com_m_contents")
      .insert({
        content_name: `【QAテスト】${key}（${TAG}）`,
        content_type: contentType,
        content_scope: scope,
        content_label: label,
        category_id: contentType === 3 ? 4 : null,
      })
      .select("content_id")
      .single();
    if (error) throw error;
    contentId = data.content_id as string;
  }
  const { error: aErr } = await service
    .from("com_m_contents_access")
    .upsert({ content_id: contentId, client_id: accessClientId, notes: `【QAテスト】${TAG}`, delete_flg: "0" }, { onConflict: "client_id,content_id" });
  if (aErr) throw aErr;
  return contentId;
}

const clientA = await ensureClient(clientNames.a);
const clientB = await ensureClient(clientNames.b);
const clientC = await ensureClient(clientNames.c);
const coachId = await ensureUser(emails.coach, "2", `QAコーチ（教材公開範囲・${TAG}）`, clientC);
const otherCoachId = await ensureUser(emails.otherCoach, "2", `QA無関係コーチ（教材公開範囲・${TAG}）`, clientC);
const studentAId = await ensureUser(emails.studentA, "1", `QA生徒A（教材公開範囲・${TAG}）`, clientA);
const studentBId = await ensureUser(emails.studentB, "1", `QA生徒B（教材公開範囲・${TAG}）`, clientB);
await ensureRelationship(clientA, studentAId, coachId);
await ensureRelationship(clientB, studentBId, coachId);

const contents = {
  3: {
    a: await ensureContent("dialogue-a", 3, 1, clientA),
    b: await ensureContent("dialogue-b", 3, 1, clientB),
    c: await ensureContent("dialogue-coach", 3, 1, clientC),
    hidden: await ensureContent("dialogue-hidden-a", 3, 9, clientA),
  },
  2: {
    a: await ensureContent("sprint-a", 2, 1, clientA),
    b: await ensureContent("sprint-b", 2, 1, clientB),
    c: await ensureContent("sprint-coach", 2, 1, clientC),
    hidden: await ensureContent("sprint-hidden-a", 2, 9, clientA),
  },
} as const;
console.log("投入完了:", { clientA, clientB, clientC, coachId, otherCoachId, studentAId, studentBId });

// -----------------------------------------------------------------------------
// 検証
// -----------------------------------------------------------------------------
const coach: SupabaseClient = await signInAsRole(emails.coach, PASSWORD);
const otherCoach: SupabaseClient = await signInAsRole(emails.otherCoach, PASSWORD);
const studentA: SupabaseClient = await signInAsRole(emails.studentA, PASSWORD);
const studentB: SupabaseClient = await signInAsRole(emails.studentB, PASSWORD);

async function rpcIds(client: SupabaseClient, studentId: string, contentType: number): Promise<Set<string>> {
  const { data, error } = await client.rpc("get_student_available_content_ids", { p_student_id: studentId, p_content_type: contentType });
  if (error) throw error;
  return new Set((data as string[] | null) ?? []);
}

async function rlsIds(client: SupabaseClient, contentType: number): Promise<Set<string>> {
  const { data, error } = await client.from("com_m_contents").select("content_id").eq("content_type", contentType).eq("delete_flg", "0");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.content_id as string));
}

function sameSet(x: Set<string>, y: Set<string>): boolean {
  return x.size === y.size && [...x].every((v) => y.has(v));
}

for (const contentType of [3, 2] as const) {
  const label = contentType === 3 ? "Dialogue(type=3)" : "Sprint(type=2)";
  const c = contents[contentType];

  // 前提: 旧実装（RLS任せ）ではコーチから全テナントの限定公開教材が見えている＝不具合の再現条件が揃っている
  const coachRls = await rlsIds(coach, contentType);
  record(`${label} 前提: コーチのRLS上は顧客A/B/C全ての限定公開教材が見える（旧実装の不具合条件）`, coachRls.has(c.a) && coachRls.has(c.b) && coachRls.has(c.c));

  const forA = await rpcIds(coach, studentAId, contentType);
  const forB = await rpcIds(coach, studentBId, contentType);
  record(`${label} 生徒A向け: 顧客Aの限定公開教材を含む`, forA.has(c.a));
  record(`${label} 生徒A向け: 顧客B（他の担当生徒）の限定公開教材を含まない`, !forA.has(c.b));
  record(`${label} 生徒A向け: 顧客C（コーチ自身）の限定公開教材を含まない`, !forA.has(c.c));
  record(`${label} 生徒A向け: 非公開(content_scope=9)は顧客Aにアクセス権があっても含まない`, !forA.has(c.hidden));
  record(`${label} 生徒B向け: 顧客Bの教材のみ含み、顧客A・Cの教材を含まない`, forB.has(c.b) && !forB.has(c.a) && !forB.has(c.c));

  // 生徒本人がRLSで閲覧できる範囲と一致すること（＝「生徒のテナントで公開されている教材」）
  const studentARls = await rlsIds(studentA, contentType);
  const studentBRls = await rlsIds(studentB, contentType);
  record(`${label} 生徒A向けRPC結果が生徒A本人のRLS閲覧範囲と一致`, sameSet(forA, studentARls), `RPC ${forA.size}件 / 本人 ${studentARls.size}件`);
  record(`${label} 生徒B向けRPC結果が生徒B本人のRLS閲覧範囲と一致`, sameSet(forB, studentBRls), `RPC ${forB.size}件 / 本人 ${studentBRls.size}件`);

  // 共通公開(content_scope=0)教材は含まれる（環境に存在する場合のみ判定）
  const { data: common } = await service.from("com_m_contents").select("content_id").eq("content_type", contentType).eq("content_scope", 0).eq("delete_flg", "0");
  const commonIds = (common ?? []).map((r) => r.content_id as string);
  record(`${label} 共通公開(content_scope=0)教材はすべて含む`, commonIds.every((id) => forA.has(id)), `共通 ${commonIds.length}件`);

  // 担当関係のないコーチ・生徒本人からの呼び出しは空集合
  const byOther = await rpcIds(otherCoach, studentAId, contentType);
  record(`${label} 担当外コーチが呼ぶと空集合`, byOther.size === 0, `${byOther.size}件`);
  const byStudentB = await rpcIds(studentB, studentAId, contentType);
  record(`${label} 他生徒(生徒B)が生徒Aを指定して呼ぶと空集合`, byStudentB.size === 0, `${byStudentB.size}件`);
}

// anonは実行不可
{
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await anon.rpc("get_student_available_content_ids", { p_student_id: studentAId, p_content_type: 3 });
  record("anonロールはRPCを実行できない", !!error, error?.code);
}

await Promise.all([coach, otherCoach, studentA, studentB].map(signOutRole));

// -----------------------------------------------------------------------------
// 後始末（FK依存順。本タグで作成したIDに限定）
// -----------------------------------------------------------------------------
if (KEEP) {
  console.log("\n--keep 指定のためテストデータを残します。");
} else {
  const userIds = [coachId, otherCoachId, studentAId, studentBId];
  const clientIds = [clientA, clientB, clientC];
  const contentIds = Object.values(contents).flatMap((c) => Object.values(c));
  const del = async (table: string, column: string, values: string[]) => {
    const { error, count } = await service.from(table).delete({ count: "exact" }).in(column, values);
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`  ${table}: ${count ?? 0}件削除`);
  };
  console.log("\n後始末:");
  await del("com_m_contents_access", "content_id", contentIds);
  await del("com_m_contents", "content_id", contentIds);
  await del("com_t_user_license", "user_id", userIds); // CASCADE: ticket → schedule
  await del("com_m_coach_student_relationship", "coach_id", userIds);
  await del("com_m_contract", "client_id", clientIds);
  await del("com_m_user", "id", userIds);
  for (const id of userIds) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) throw error;
  }
  console.log(`  auth.users: ${userIds.length}件削除`);
  await del("com_m_client", "client_id", clientIds);
}

writeResultLog({ scenario: "student-scoped-contents", env, tag: TAG, checks });
console.log(`\n結果: ${checks.filter((c) => c.ok).length}/${checks.length} OK`);
if (checks.some((c) => !c.ok)) process.exit(1);
