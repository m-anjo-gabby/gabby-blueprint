/**
 * coach-no-show-resolution.feature の投入スクリプト。
 * resolve_stale_session の新分岐(p_resolution=4: コーチ自身の無断欠席)を検証するため、
 * 「終了予定時刻を過ぎてもscheduledのまま残っているセッション」を2件（QA生徒NS用に1件、
 * 回帰確認用のQA生徒NM用に1件）、KJ-2026-0910-01のハイブリッド方式
 * （schedule/ticketは本物のadmin_match_student_with_coach経由、対象セッションのみ
 * service_roleで直接INSERT）で用意する。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/coach-no-show-resolution-seed.ts --env=dev --tag=noshow01
 *
 * テスト完了後にデータを削除する運用のため（ユーザー指示）、cleanup用に
 * coach-no-show-resolution-cleanup.ts を用意している。verify.ts実行後に実行すること。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { assertReleaseApplied } from "../../../helpers/preflight.ts";
import { addDays } from "../../../helpers/dates.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;

const admin = await createAdminClient();
const TODAY = new Date();

console.log(`\n=== coach-no-show-resolution シナリオ投入: env=${env} tag=${TAG} ===`);

// ---------------------------------------------------------------------------
// Preflight: resolve_stale_session が新シグネチャ(p_resolution)で反映済みか確認
// ---------------------------------------------------------------------------
await assertReleaseApplied(admin, [
  { name: "admin_match_student_with_coach", dummyArgs: { p_ticket_id: "00000000-0000-0000-0000-000000000000", p_coach_id: "00000000-0000-0000-0000-000000000000", p_slot_no: 1, p_day_of_week: 1, p_start_time: "10:00", p_end_time: "10:30" } },
  { name: "fn_schedule_shortfall", dummyArgs: { p_schedule_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "resolve_stale_session", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000", p_resolution: 1, p_reason: "preflight" } },
]);
console.log("Preflight OK: 対象RPCはすべて反映済みです。");

// 旧シグネチャ(p_completion_result)がまだ残っていないか、念のため明示確認する
// （42P13の教訓：引数名変更はDROP FUNCTIONが必須。CREATE OR REPLACEだけの中途半端な
// 反映だと旧シグネチャのまま残っている可能性があるため、新旧どちらでも「関数が存在する」
// ことになるassertReleaseAppliedだけでは見分けられない）
{
  const { error } = await admin.rpc("resolve_stale_session", {
    p_session_id: "00000000-0000-0000-0000-000000000000",
    p_completion_result: 1,
    p_reason: "preflight-old-signature-check",
  });
  if (error?.code !== "PGRST202") {
    throw new Error(
      `resolve_stale_session が旧シグネチャ(p_completion_result)でも受理されてしまいました(error=${JSON.stringify(error)})。` +
        `DROP FUNCTIONを含む最新のリリースSQLが適用されているか確認してください。`
    );
  }
}
console.log("Preflight OK: resolve_stale_session は新シグネチャ(p_resolution)のみで受理され、旧シグネチャは残っていません。");

// ---------------------------------------------------------------------------
// 共通ヘルパー（session-lifecycle-refactor-seed.tsと同一パターン）
// ---------------------------------------------------------------------------
async function ensureClient(name: string): Promise<string> {
  const { data: existing } = await admin.from("com_m_client").select("client_id").eq("client_name", name).maybeSingle();
  if (existing) return existing.client_id as string;
  const { data, error } = await admin.from("com_m_client").insert({ client_name: name, client_type: 1, industry_type: 1 }).select("client_id").single();
  if (error) throw error;
  return data.client_id as string;
}

async function findAuthUserByEmail(email: string): Promise<string | undefined> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return undefined;
}

async function ensureUser(email: string, userType: "0" | "1" | "2", userName: string, clientId: string | null): Promise<string> {
  let userId = await findAuthUserByEmail(email);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error: updErr } = await admin.from("com_m_user").update({ client_id: clientId, user_type: userType, user_name: userName }).eq("id", userId);
  if (updErr) throw updErr;
  return userId;
}

type Plan = { plan_id: string; plan_name: string; plan_name_en: string; contract_type: number; weekly_frequency: number | null; total_sessions: number | null; has_dialogue_practice: boolean };
async function getPlan(planCode: string): Promise<Plan> {
  const { data, error } = await admin.from("com_m_contract_plan").select("*").eq("plan_code", planCode).single();
  if (error) throw error;
  return data as Plan;
}

async function createContractLicenseTicket(params: { clientId: string; userId: string; plan: Plan; startDate: Date; endDate: Date; note: string }) {
  const { data: contract, error: cErr } = await admin
    .from("com_m_contract")
    .insert({
      client_id: params.clientId,
      plan_name: params.plan.plan_name,
      plan_name_en: params.plan.plan_name_en,
      plan_id: params.plan.plan_id,
      max_licenses: 1,
      start_date: params.startDate.toISOString(),
      end_date: params.endDate.toISOString(),
      status: 1,
      contract_type: params.plan.contract_type,
      weekly_frequency: params.plan.weekly_frequency,
      total_sessions: params.plan.total_sessions,
      has_dialogue_practice: params.plan.has_dialogue_practice,
      note: params.note,
    })
    .select("contract_id")
    .single();
  if (cErr) throw cErr;

  const { data: license, error: lErr } = await admin
    .from("com_t_user_license")
    .insert({ contract_id: contract.contract_id, user_id: params.userId, status: 1, start_date: params.startDate.toISOString(), end_date: params.endDate.toISOString() })
    .select("license_id")
    .single();
  if (lErr) throw lErr;

  const { data: ticket, error: tErr } = await admin
    .from("com_t_user_session_ticket")
    .insert({
      license_id: license.license_id,
      contract_id: contract.contract_id,
      user_id: params.userId,
      weekly_frequency: params.plan.weekly_frequency,
      total_sessions: params.plan.total_sessions,
      used_sessions: 0,
    })
    .select("ticket_id")
    .single();
  if (tErr) throw tErr;

  return { contractId: contract.contract_id as string, licenseId: license.license_id as string, ticketId: ticket.ticket_id as string };
}

async function matchViaAdmin(adminClient: SupabaseClient, params: { ticketId: string; coachId: string; slotNo: number; dayOfWeek: number; startTime: string; endTime: string }): Promise<string> {
  const { data, error } = await adminClient.rpc("admin_match_student_with_coach", {
    p_ticket_id: params.ticketId,
    p_coach_id: params.coachId,
    p_slot_no: params.slotNo,
    p_day_of_week: params.dayOfWeek,
    p_start_time: params.startTime,
    p_end_time: params.endTime,
  });
  if (error) throw error;
  return data as string;
}

/** admin_match_student_with_coachが生成した、指定scheduleのstatus=1セッション一覧(開始日時昇順)を取得する。 */
async function listScheduledSessionIds(scheduleId: string): Promise<string[]> {
  const { data, error } = await admin.from("com_t_session").select("session_id").eq("schedule_id", scheduleId).eq("status", 1).order("start_datetime", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s) => s.session_id as string);
}

/**
 * 既存の(未来の)status=1セッション1件を、開始/終了日時だけ過去に書き換えて「終了予定時刻を
 * 過ぎてもscheduledのまま残っているセッション」を再現する。admin_match_student_with_coachは
 * target_sessions分まで生成上限いっぱいに生成するため、ここで新規INSERTしてしまうと
 * (target_sessions+1)件になりfn_schedule_shortfallの空き容量検証(actual==expected)の前提が
 * 崩れる。既存の1件を転用することで、生成済み件数(=target_sessions)を変えずに
 * 「このコマが未実施のまま残っている」状態を再現する（KJ-2026-0910-01のハイブリッド方式の変形）。
 */
async function makeSessionStale(sessionId: string, start: Date, end: Date): Promise<void> {
  const { error } = await admin.from("com_t_session").update({ start_datetime: start.toISOString(), end_datetime: end.toISOString() }).eq("session_id", sessionId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// 共通セットアップ: 顧客・コーチ2名（担当コーチ＋権限チェック用の無関係コーチ）・アドミン
// ---------------------------------------------------------------------------
const clientId = await ensureClient(`【QAテスト】コーチ無断欠席解決検証（${TAG}）`);
const coachEmail = `${TAG}-noshow-coach@gabby-qa-test.example`;
const coachId = await ensureUser(coachEmail, "2", `QAコーチ（無断欠席解決・${TAG}）`, clientId);
const otherCoachEmail = `${TAG}-noshow-other-coach@gabby-qa-test.example`;
const otherCoachId = await ensureUser(otherCoachEmail, "2", `QA無関係コーチ（無断欠席解決・${TAG}）`, clientId);

const adminEmail = "qa-admin@gabby-qa-test.example";
let adminUserId = await findAuthUserByEmail(adminEmail);
if (!adminUserId) {
  adminUserId = await ensureUser(adminEmail, "0", "QAアドミン（代理操作用）", null);
} else {
  await admin.from("com_m_user").update({ user_type: "0" }).eq("id", adminUserId);
}

const adminClient: SupabaseClient = await signInAsRole(adminEmail, PASSWORD);
const coachClient: SupabaseClient = await signInAsRole(coachEmail, PASSWORD);
const otherCoachClient: SupabaseClient = await signInAsRole(otherCoachEmail, PASSWORD);

console.log("共通セットアップ完了:", { clientId, coachId, otherCoachId, adminUserId });

const STANDARD = await getPlan("LIVE_WEEKLY1_3M");
const summary: Record<string, unknown> = { tag: TAG, clientId, coachId, coachEmail, otherCoachId, otherCoachEmail };

// ---------------------------------------------------------------------------
// 生徒NS: コーチ無断欠席(coach_no_show=4)のメインシナリオ
// ---------------------------------------------------------------------------
console.log("\n--- 生徒NS: コーチ無断欠席(coach_no_show=4) ---");
const nsId = await ensureUser(`${TAG}-noshow-student-ns@gabby-qa-test.example`, "1", `QA生徒NS（コーチ無断欠席・${TAG}）`, clientId);
const nsStart = addDays(TODAY, -30);
const nsEnd = addDays(TODAY, 335);
const { ticketId: nsTicketId } = await createContractLicenseTicket({ clientId, userId: nsId, plan: STANDARD, startDate: nsStart, endDate: nsEnd, note: `QA自動テスト(${TAG}) 生徒NS コーチ無断欠席` });
const nsSchedule = await matchViaAdmin(adminClient, { ticketId: nsTicketId, coachId, slotNo: 1, dayOfWeek: 1, startTime: "10:00", endTime: "10:30" });

const nsSessionIds = await listScheduledSessionIds(nsSchedule);
if (nsSessionIds.length === 0) throw new Error("生徒NSの生成済みセッションが0件です");
const nsSessionId = nsSessionIds[0];
const nsPastStart = addDays(TODAY, -2);
const nsPastEnd = new Date(nsPastStart.getTime() + 30 * 60 * 1000);
await makeSessionStale(nsSessionId, nsPastStart, nsPastEnd);
console.log("生徒NS投入完了:", { nsTicketId, nsSchedule, nsSessionId });

// ---------------------------------------------------------------------------
// 生徒NM: 引数名変更後もnormal解決(p_resolution=1)が従来通り動くことの回帰確認
// ---------------------------------------------------------------------------
console.log("\n--- 生徒NM: normal解決(p_resolution=1)の回帰確認 ---");
const nmId = await ensureUser(`${TAG}-noshow-student-nm@gabby-qa-test.example`, "1", `QA生徒NM（normal回帰確認・${TAG}）`, clientId);
const nmStart = addDays(TODAY, -30);
const nmEnd = addDays(TODAY, 335);
const { ticketId: nmTicketId } = await createContractLicenseTicket({ clientId, userId: nmId, plan: STANDARD, startDate: nmStart, endDate: nmEnd, note: `QA自動テスト(${TAG}) 生徒NM normal回帰確認` });
const nmSchedule = await matchViaAdmin(adminClient, { ticketId: nmTicketId, coachId, slotNo: 1, dayOfWeek: 2, startTime: "10:00", endTime: "10:30" });

const nmSessionIds = await listScheduledSessionIds(nmSchedule);
if (nmSessionIds.length === 0) throw new Error("生徒NMの生成済みセッションが0件です");
const nmSessionId = nmSessionIds[0];
const nmPastStart = addDays(TODAY, -2);
const nmPastEnd = new Date(nmPastStart.getTime() + 30 * 60 * 1000);
await makeSessionStale(nmSessionId, nmPastStart, nmPastEnd);
console.log("生徒NM投入完了:", { nmTicketId, nmSchedule, nmSessionId });

// ---------------------------------------------------------------------------
// サインアウト(投入したDBデータ自体は削除しない。verify.ts→cleanup.tsの順で後始末する)
// ---------------------------------------------------------------------------
await adminClient.auth.signOut();
await coachClient.auth.signOut();
await otherCoachClient.auth.signOut();

Object.assign(summary, {
  nsId, nsTicketId, nsSchedule, nsSessionId,
  nmId, nmTicketId, nmSchedule, nmSessionId,
});

console.log(`\n=== 投入完了 ===`);
console.log(JSON.stringify(summary, null, 2));
console.log("\n次のステップ: coach-no-show-resolution-verify.ts を同じ --env / --tag で実行してください。");
console.log("検証完了後、coach-no-show-resolution-cleanup.ts を同じ --env / --tag で実行してテストデータを削除してください。");
