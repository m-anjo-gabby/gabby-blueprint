/**
 * トレーニングレポート（ドラフト）と、その前提となる DB 変更の検証。
 *   - 会社情報の法人ごと化（GABBY_JP / GVT_CA の2行・法人コードの一意制約）
 *   - スプリント到達レベルの変更履歴（student_m_sprint_progress のトリガー）
 *       コーチの引き上げ（実際にサインインしたコーチのJWT）→ changed_by にコーチ
 *       管理者の引き下げ（アプリと同じ service_role 経由）→ 「修正」として直近の誤った記録を取り消し、
 *       修正前に遡ってレベルが修正後の値になる（get_sprint_level_as_of）
 *   - 集計RPC get_training_report_targets / get_training_report_data（期間外の学習記録の除外・
 *     月ごとの集計・コメントの記入状況）と実行権限（service_role のみ）
 *
 * シナリオ（いずれもタグ付きの使い捨てデータ）:
 *   ライブ付き（週1回）契約の生徒1名と担当コーチ1名。期間は「60日前〜30日後」。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20260925-dev/training-report-verify.ts --env=dev --tag=trp01
 *   --keep          … 検証後もデータを残す（PDFの目視確認用。後で --cleanup-only で削除する）
 *   --cleanup-only  … 検証せず、指定タグのデータを削除する
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import { assertReleaseApplied } from "../../../helpers/preflight.ts";
import { addDays } from "../../../helpers/dates.ts";
import { writeResultLog, type CheckResult } from "../../../helpers/results.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const KEEP = process.argv.includes("--keep");
const CLEANUP_ONLY = process.argv.includes("--cleanup-only");
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;
const ADMIN_EMAIL = "qa-admin@gabby-qa-test.example";
const DUMMY_UUID = "00000000-0000-0000-0000-000000000000";
const TODAY = new Date();
const SPEED = 0;

const service = await createAdminClient(); // データ投入・結果の読み取り・後始末専用
const checks: CheckResult[] = [];
function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` … ${detail}` : ""}`);
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const clientName = `【QAテスト】トレーニングレポート検証（${TAG}）`;
const emails = {
  coach: `${TAG}-trp-coach@gabby-qa-test.example`,
  student: `${TAG}-trp-student@gabby-qa-test.example`,
};

async function findAuthUserByEmail(email: string): Promise<string | undefined> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 後始末（本タグで作成した顧客・ユーザーのIDに絞ってFK依存順に削除）
// ---------------------------------------------------------------------------
async function cleanup(): Promise<void> {
  const del = async (label: string, run: () => PromiseLike<{ error: unknown; count: number | null }>) => {
    const { error, count } = await run();
    if (error) throw error;
    console.log(`  削除 ${label}: ${count ?? 0}件`);
  };
  console.log("\n後始末:");
  const { data: client } = await service.from("com_m_client").select("client_id").eq("client_name", clientName).maybeSingle();
  const userIds = (await Promise.all(Object.values(emails).map(findAuthUserByEmail))).filter((id): id is string => !!id);
  if (userIds.length > 0) {
    await del("com_t_user_license（チケット・コメントは連鎖削除）", () => service.from("com_t_user_license").delete({ count: "exact" }).in("user_id", userIds));
    await del("com_m_coach_student_relationship", () => service.from("com_m_coach_student_relationship").delete({ count: "exact" }).in("coach_id", userIds));
  }
  if (client) await del("com_m_contract", () => service.from("com_m_contract").delete({ count: "exact" }).eq("client_id", client.client_id));
  if (userIds.length > 0) {
    await del("com_m_user（進捗・レベル履歴・学習サマリーは連鎖削除）", () => service.from("com_m_user").delete({ count: "exact" }).in("id", userIds));
    for (const id of userIds) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) throw error;
    }
    console.log(`  削除 auth.users: ${userIds.length}件`);
  }
  if (client) await del("com_m_client", () => service.from("com_m_client").delete({ count: "exact" }).eq("client_id", client.client_id));
}

if (CLEANUP_ONLY) {
  await cleanup();
  process.exit(0);
}

console.log(`\n=== トレーニングレポートの検証: env=${env} tag=${TAG} ===`);

await assertReleaseApplied(service, [
  { name: "get_training_report_targets", dummyArgs: { p_from: TODAY.toISOString(), p_to: TODAY.toISOString() } },
  { name: "get_training_report_data", dummyArgs: { p_license_ids: [DUMMY_UUID] } },
  { name: "get_sprint_level_as_of", dummyArgs: { p_user_id: DUMMY_UUID, p_question_type: 0, p_at: TODAY.toISOString() } },
]);

// ---------------------------------------------------------------------------
// 1. 会社情報（法人ごと）
// ---------------------------------------------------------------------------
{
  const { data, error } = await service.from("com_m_company_profile").select("company_code, company_name, company_name_ja, address");
  if (error) throw error;
  const jp = data?.find((r) => r.company_code === "GABBY_JP");
  const ca = data?.find((r) => r.company_code === "GVT_CA");
  record("会社情報: 日本法人(GABBY_JP)の行がある", !!jp && jp.company_name_ja === "株式会社ギャビーアカデミー", jp ? `${jp.company_name_ja} / ${jp.company_name}` : "なし");
  record("会社情報: バンクーバー法人(GVT_CA)の行がある", !!ca, ca?.company_name);
  const { error: dupError } = await service.from("com_m_company_profile").insert({ company_code: "GABBY_JP", company_name: "dup", address: "dup" });
  record("会社情報: 同じ法人コードの行は追加できない（一意制約）", dupError?.code === "23505", dupError?.code);
}

// ---------------------------------------------------------------------------
// データ投入
// ---------------------------------------------------------------------------
{
  const { data: existing } = await service.from("com_m_client").select("client_id").eq("client_name", clientName).maybeSingle();
  if (existing) throw new Error(`タグ ${TAG} のデータが残っています。--cleanup-only で削除するか、別のタグで実行してください。`);
}
const { data: clientRow, error: clientError } = await service
  .from("com_m_client")
  .insert({ client_name: clientName, client_type: 1, industry_type: 1 })
  .select("client_id")
  .single();
if (clientError) throw clientError;
const clientId = clientRow.client_id as string;

async function ensureUser(email: string, userType: "1" | "2", userName: string): Promise<string> {
  let userId = await findAuthUserByEmail(email);
  if (!userId) {
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error } = await service.from("com_m_user").update({ client_id: clientId, user_type: userType, user_name: userName }).eq("id", userId);
  if (error) throw error;
  return userId;
}

let failed = false;
try {
  const coachId = await ensureUser(emails.coach, "2", `QAテストコーチ（${TAG}）`);
  const studentId = await ensureUser(emails.student, "1", `QAテスト生徒（${TAG}）`);
  const { error: relError } = await service.from("com_m_coach_student_relationship").insert({ coach_id: coachId, student_id: studentId, is_active: true });
  if (relError) throw relError;

  const { data: plan, error: planError } = await service.from("com_m_contract_plan").select("*").eq("plan_code", "LIVE_WEEKLY1_3M").single();
  if (planError) throw planError;
  const startDate = addDays(TODAY, -60);
  const endDate = addDays(TODAY, 30);
  const { data: contract, error: cErr } = await service
    .from("com_m_contract")
    .insert({
      client_id: clientId,
      plan_name: plan.plan_name,
      contract_name: `【QAテスト】トレーニングレポート ${TAG}`,
      plan_name_en: plan.plan_name_en,
      plan_id: plan.plan_id,
      max_licenses: 1,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      status: 1,
      contract_type: plan.contract_type,
      weekly_frequency: plan.weekly_frequency,
      total_sessions: plan.total_sessions,
      has_dialogue_practice: plan.has_dialogue_practice,
      note: `【QAテスト】${TAG}`,
    })
    .select("contract_id")
    .single();
  if (cErr) throw cErr;
  const { data: license, error: lErr } = await service
    .from("com_t_user_license")
    .insert({ contract_id: contract.contract_id, user_id: studentId, status: 1, start_date: startDate.toISOString(), end_date: endDate.toISOString() })
    .select("license_id")
    .single();
  if (lErr) throw lErr;
  const licenseId = license.license_id as string;
  const { data: ticket, error: tErr } = await service
    .from("com_t_user_session_ticket")
    .insert({ license_id: licenseId, contract_id: contract.contract_id, user_id: studentId, weekly_frequency: plan.weekly_frequency, total_sessions: plan.total_sessions, used_sessions: 0 })
    .select("ticket_id")
    .single();
  if (tErr) throw tErr;

  // ---------------------------------------------------------------------------
  // 2. スプリント到達レベルの変更履歴
  // ---------------------------------------------------------------------------
  async function history() {
    const { data, error } = await service
      .from("student_t_sprint_level_history")
      .select("history_id, old_level, new_level, change_kind, effective_at, changed_by, voided_at, voided_by_history_id")
      .eq("user_id", studentId)
      .eq("question_type", SPEED)
      .order("history_id");
    if (error) throw error;
    return data ?? [];
  }
  async function levelAsOf(at: Date): Promise<number | null> {
    const { data, error } = await service.rpc("get_sprint_level_as_of", { p_user_id: studentId, p_question_type: SPEED, p_at: at.toISOString() });
    if (error) throw error;
    return data as number | null;
  }

  const { data: progress } = await service.from("student_m_sprint_progress").select("level_speed").eq("user_id", studentId).single();
  const baseLevel = progress?.level_speed as number;
  const h0 = await history();
  record("レベル履歴: 進捗行の作成時に起点(change_kind=0)が記録される", h0.length === 1 && h0[0].change_kind === 0 && h0[0].new_level === baseLevel, `起点 Lv${baseLevel}`);

  const coach = await signInAsRole(emails.coach, PASSWORD);
  const raise = async (level: number) => {
    const { error } = await coach.from("student_m_sprint_progress").update({ level_speed: level }).eq("user_id", studentId);
    if (error) throw error;
  };
  await sleep(1100);
  await raise(baseLevel + 3); // 正しい引き上げ
  await sleep(1100);
  const afterFirstRaise = new Date();
  await sleep(1100);
  await raise(baseLevel + 5); // コーチの誤操作
  await sleep(1100);
  const afterMistake = new Date();
  await signOutRole(coach);

  const h1 = await history();
  const coachRows = h1.filter((r) => r.change_kind === 1);
  record("レベル履歴: コーチの引き上げは change_kind=1・changed_by=コーチで記録される", coachRows.length === 2 && coachRows.every((r) => r.changed_by === coachId));
  record("レベル履歴: 修正前は誤操作後の時点のレベルが誤った値", (await levelAsOf(afterMistake)) === baseLevel + 5);

  // 管理者の修正（アプリの adminStudentProgressAction と同じく service_role で更新）
  {
    const { error } = await service.from("student_m_sprint_progress").update({ level_speed: baseLevel + 3 }).eq("user_id", studentId);
    if (error) throw error;
  }
  const h2 = await history();
  const mistake = h2.find((r) => r.change_kind === 1 && r.new_level === baseLevel + 5);
  const correction = h2.find((r) => r.change_kind === 2);
  record("レベル履歴: 管理者の引き下げは change_kind=2（修正）・changed_by=NULLで記録される", !!correction && correction.changed_by === null && correction.new_level === baseLevel + 3);
  record("レベル履歴: 修正で誤った引き上げが取消済みになる", !!mistake?.voided_at && mistake.voided_by_history_id === correction?.history_id);
  record(
    "レベル履歴: 修正の行は取り消した行と同じ日時に遡って記録される",
    !!correction && !!mistake && new Date(correction.effective_at).getTime() === new Date(mistake.effective_at).getTime()
  );
  record("レベル履歴: 修正後は誤操作後の時点のレベルも修正後の値になる", (await levelAsOf(afterMistake)) === baseLevel + 3, `Lv${await levelAsOf(afterMistake)}`);
  record("レベル履歴: 正しい引き上げの直後の時点は影響を受けない", (await levelAsOf(afterFirstRaise)) === baseLevel + 3);

  // 起点より上の記録をすべて取り消す修正（正しい引き上げも含めて誤りだった場合）
  {
    const { error } = await service.from("student_m_sprint_progress").update({ level_speed: baseLevel + 1 }).eq("user_id", studentId);
    if (error) throw error;
  }
  const h3 = await history();
  const activeRows = h3.filter((r) => r.voided_at === null);
  record(
    "レベル履歴: 2回目の修正で、修正後より高い直近の記録（引き上げ・前回の修正）がすべて取り消される",
    activeRows.length === 2 && activeRows[0].change_kind === 0 && activeRows[1].change_kind === 2 && activeRows[1].new_level === baseLevel + 1,
    `有効な行: ${activeRows.map((r) => `kind${r.change_kind}:Lv${r.new_level}`).join(", ")}`
  );
  record("レベル履歴: 最初の引き上げ直後の時点も修正後の値になる", (await levelAsOf(afterFirstRaise)) === baseLevel + 1);
  record("レベル履歴: 記録開始前の時点は不明(NULL)", (await levelAsOf(addDays(TODAY, -1))) === null);
  const finalSpeed = baseLevel + 1;

  // ---------------------------------------------------------------------------
  // 3. 集計RPC
  // ---------------------------------------------------------------------------
  const { data: content } = await service.from("com_m_contents").select("content_id").limit(2);
  const [contentA, contentB] = (content ?? []).map((c) => c.content_id as string);
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  const inPeriod1 = addDays(TODAY, -40);
  const inPeriod2 = addDays(TODAY, -5);
  const outOfPeriod = addDays(TODAY, -70);
  {
    const { error: wErr } = await service.from("self_t_word_summary").insert([
      { user_id: studentId, content_id: contentA, training_date: isoDate(inPeriod1), word_count: 10, phrase_count: 4, assessment_count: 2 },
      { user_id: studentId, content_id: contentA, training_date: isoDate(inPeriod2), word_count: 6, phrase_count: 0, assessment_count: 1 },
      { user_id: studentId, content_id: contentA, training_date: isoDate(outOfPeriod), word_count: 99, phrase_count: 99, assessment_count: 99 },
    ]);
    if (wErr) throw wErr;
    const { error: sErr } = await service.from("self_t_sprint_summary").insert([
      { user_id: studentId, content_id: contentB ?? contentA, training_date: isoDate(inPeriod2), question_count: 20, assessment_count: 3 },
    ]);
    if (sErr) throw sErr;
  }
  const coach2 = await signInAsRole(emails.coach, PASSWORD);
  {
    const { error } = await coach2.from("com_t_contract_training_report").insert({ ticket_id: ticket.ticket_id, student_id: studentId, coach_id: coachId, comment_text: "Great progress this term!" });
    if (error) throw error;
  }

  const endMonth = isoDate(endDate).slice(0, 7);
  const [y, m] = endMonth.split("-").map(Number);
  const monthFrom = new Date(`${endMonth}-01T00:00:00+09:00`).toISOString();
  const nextMonth = new Date(Date.UTC(y, m, 1));
  const monthTo = new Date(`${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00+09:00`).toISOString();
  const { data: targets, error: targetsError } = await service.rpc("get_training_report_targets", { p_from: monthFrom, p_to: monthTo });
  if (targetsError) throw targetsError;
  const target = (targets ?? []).find((r: { license_id: string }) => r.license_id === licenseId);
  record("一覧: 満了月の一覧に対象ライセンスが出る", !!target, endMonth);
  record("一覧: ライブ付き・コメント下書き1件として出る", target?.has_live_session === true && target?.draft_comment_count === 1 && target?.finalized_comment_count === 0);

  const { data: reportData, error: dataError } = await service.rpc("get_training_report_data", { p_license_ids: [licenseId] });
  if (dataError) throw dataError;
  const report = (reportData ?? [])[0];
  record("データ: 1件返る", (reportData ?? []).length === 1);
  record(
    "データ: 学習量は期間内の記録だけを合計する",
    report?.activity.active_days === 2 && report?.activity.words === 16 && report?.activity.phrases === 4 && report?.activity.sprint_questions === 20 && report?.activity.assessments === 6,
    JSON.stringify(report?.activity)
  );
  const expectedMonths = new Set([isoDate(inPeriod1).slice(0, 7), isoDate(inPeriod2).slice(0, 7)]).size;
  record("データ: 月ごとの集計が学習した月の数だけ並ぶ", report?.monthly.length === expectedMonths, JSON.stringify(report?.monthly));
  record("データ: 開始時点のレベルは記録開始前のため不明(NULL)", report?.levels_start["0"] === null);
  record("データ: 終了前に作成した場合は作成時点（修正後）のレベル", report?.levels_end["0"] === finalSpeed, `Lv${report?.levels_end["0"]}`);
  record("データ: ライブセッションの契約回数が入る", report?.live?.total_sessions === plan.total_sessions && report?.live?.completed === 0);
  record("データ: コーチのコメント（下書き）が入る", report?.comments.length === 1 && report.comments[0].status === 1);

  // 実行権限: service_role のみ（生徒・コーチ・管理者のJWTからは直接呼べない）
  const admin = await signInAsRole(ADMIN_EMAIL, PASSWORD);
  for (const [label, client] of [["コーチ", coach2], ["管理者", admin]] as const) {
    const { error } = await client.rpc("get_training_report_data", { p_license_ids: [licenseId] });
    record(`権限: ${label}のJWTでは get_training_report_data を実行できない`, error?.code === "42501", error?.code);
  }
  {
    const { data, error } = await coach2.from("student_t_sprint_level_history").select("history_id").eq("user_id", studentId);
    record("権限: コーチはレベル履歴を参照できない（RLS）", !error && (data ?? []).length === 0);
  }
  await signOutRole(coach2);
  await signOutRole(admin);

  console.log(`\nlicense_id=${licenseId}`);
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  if (KEEP) {
    console.log(`\n--keep 指定のためテストデータを残します（client: ${clientName}）`);
  } else {
    await cleanup();
  }
}

const log = writeResultLog({ scenario: "training-report", env, tag: TAG, checks });
console.log(`\n結果: ${log.passed}/${log.totalChecks} OK`);
if (failed) process.exit(1);
