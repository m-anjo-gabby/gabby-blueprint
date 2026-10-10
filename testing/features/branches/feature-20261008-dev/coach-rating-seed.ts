/**
 * コーチ評価（生徒の評価ダイアログ・コーチの My Rating・コーチ選択の星）の画面確認用データ投入スクリプト。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20261008-dev/coach-rating-seed.ts --env=dev --tag=rating1010
 *
 * 投入するデータ（いずれも使い捨てのタグデータ。1生徒=1シナリオ）:
 *   - コーチ: プロフィールの作成と同時に初期値の評価（3項目とも4）が1件入る。平日 09:00〜12:00・18:00〜22:00（東京）に空き時間
 *   - 生徒RA（週1回）: 契約の終了まで10日・実施済み1回 → 「評価をお願いします」が出る（終了14日前の条件）
 *   - 生徒RB（週2回・2コマとも同じコーチ）: 契約の終了まで76日・実施済み1回・残りの予定はすべて生徒キャンセル
 *     → 「評価をお願いします」が1行だけ出る（予定が残っていない条件・同じコーチは1回）
 *   - 生徒RC（週1回）: 契約の終了まで10日・評価済み（5/5/4・運営へのコメントあり） → 出ない（評価済み）
 *   - 生徒RD（週1回）: 契約の終了まで76日・実施済み1回・予定が残っている → 出ない（受付期間前）
 *   - 生徒RE（週1回）: 専属コーチ未選択 → 「専属コーチを探す」でコーチのカード・プロフィールの星を確認する
 *   投入後のコーチの評価: 2件（初期値4/4/4・RCの5/5/4）、総合4.3・コーチング4.5・親近感4.5
 *
 * 過去の実施済みセッションは、生成済みの予定をservice_roleで過去日時へ移して完了扱いにする（RPCでは過去日時を作れないため）。
 * マッチングは qa-admin の JWT で admin_match_student_with_coach、キャンセル・評価は各生徒の JWT で RPC を呼ぶ。
 *
 * 後始末は coach-rating-cleanup.ts を同じ --env / --tag で実行する。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import { assertReleaseApplied } from "../../../helpers/preflight.ts";
import { addDays } from "../../../helpers/dates.ts";
import { createFixtureKit } from "../../../helpers/fixture-accounts.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;
const DUMMY_UUID = "00000000-0000-0000-0000-000000000000";
const COACH_TIMEZONE = "Asia/Tokyo";

const admin = await createAdminClient();
const kit = createFixtureKit(admin, PASSWORD);
const TODAY = new Date();

console.log(`\n=== コーチ評価 画面確認データ投入: env=${env} tag=${TAG} ===`);

await assertReleaseApplied(admin, [
  { name: "admin_match_student_with_coach", dummyArgs: { p_ticket_id: DUMMY_UUID, p_coach_id: DUMMY_UUID, p_slot_no: 1, p_day_of_week: 1, p_start_time: "10:00", p_end_time: "10:30" } },
  { name: "cancel_session", dummyArgs: { p_session_id: DUMMY_UUID } },
  { name: "submit_coach_rating", dummyArgs: { p_ticket_id: DUMMY_UUID, p_coach_id: DUMMY_UUID, p_coaching_score: 1, p_friendliness_score: 1, p_recommendation_score: 1, p_feedback: "" } },
]);
console.log("Preflight OK: 対象RPCはすべて反映済みです。");

// ---------------------------------------------------------------------------
// 共通ヘルパー（feature-20260925-dev/live-session-hub-redesign-seed.ts と同型）
// ---------------------------------------------------------------------------
type Plan = { plan_id: string; plan_name: string; plan_name_en: string; contract_type: number; weekly_frequency: number | null; total_sessions: number | null; has_dialogue_practice: boolean };
async function getPlan(planCode: string): Promise<Plan> {
  const { data, error } = await admin.from("com_m_contract_plan").select("*").eq("plan_code", planCode).single();
  if (error) throw error;
  return data as Plan;
}

async function createContractLicenseTicket(params: { clientId: string; userId: string; plan: Plan; startDate: Date; endDate: Date; note: string }): Promise<string> {
  const { data: contract, error: cErr } = await admin
    .from("com_m_contract")
    .insert({
      client_id: params.clientId,
      plan_name: params.plan.plan_name,
      contract_name: `${params.plan.plan_name} ${crypto.randomUUID().slice(0, 8)}`,
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
  return ticket.ticket_id as string;
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

async function listScheduledSessions(scheduleId: string): Promise<{ session_id: string }[]> {
  const { data, error } = await admin
    .from("com_t_session")
    .select("session_id")
    .eq("schedule_id", scheduleId)
    .eq("status", 1)
    .order("start_datetime", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 生成済みの予定を過去日時へ移し、正常完了として記録する（初期データ投入） */
async function backdateAsCompleted(sessionId: string, daysAgo: number): Promise<void> {
  const start = addDays(TODAY, -daysAgo);
  start.setUTCHours(1, 0, 0, 0);
  const end = new Date(start.getTime() + 25 * 60 * 1000);
  const { error } = await admin
    .from("com_t_session")
    .update({ start_datetime: start.toISOString(), end_datetime: end.toISOString(), status: 2, completion_result: 1 })
    .eq("session_id", sessionId);
  if (error) throw error;
}

async function cancelAs(client: SupabaseClient, sessionId: string, reason: string): Promise<void> {
  const { error } = await client.rpc("cancel_session", { p_session_id: sessionId, p_reason: reason, p_proposed_slots: null });
  if (error) throw error;
}

/** 生徒を作り、ライブセッション付きの契約を1件持たせる（利用規約は同意済みにして画面確認の邪魔をしない） */
async function createStudent(key: string, label: string, plan: Plan, endInDays: number): Promise<{ email: string; studentId: string; ticketId: string }> {
  const email = `${TAG}-rating-student-${key}@gabby-qa-test.example`;
  const studentId = await kit.ensureUser({ email, userType: "1", userName: `QA生徒${key.toUpperCase()}（${label}・${TAG}）`, clientId });
  await kit.ensureLatestTermsAgreed(studentId);
  const ticketId = await createContractLicenseTicket({
    clientId,
    userId: studentId,
    plan,
    startDate: addDays(TODAY, endInDays - 90),
    endDate: addDays(TODAY, endInDays),
    note: `QA自動テスト(${TAG}) 生徒${key.toUpperCase()} ${label}`,
  });
  return { email, studentId, ticketId };
}

// ---------------------------------------------------------------------------
// 共通セットアップ
// ---------------------------------------------------------------------------
const clientId = await kit.ensureClient(`【QAテスト】コーチ評価検証（${TAG}）`);
const coachEmail = `${TAG}-rating-coach@gabby-qa-test.example`;
const coachId = await kit.ensureUser({ email: coachEmail, userType: "2", userName: `QA Coach Rating ${TAG}`, clientId, timezone: COACH_TIMEZONE });
await kit.ensureLatestTermsAgreed(coachId);
// プロフィールの作成と同時に、初期値の評価（3項目とも4）がトリガーで1件入る
await kit.ensureCoachProfile(coachId);
await kit.ensureCoachAvailability(coachId, COACH_TIMEZONE, [1, 2, 3, 4, 5], "09:00:00", "22:00:00");

const adminClient = await signInAsRole("qa-admin@gabby-qa-test.example", PASSWORD);
const WEEKLY1 = await getPlan("LIVE_WEEKLY1_3M");
const WEEKLY2 = await getPlan("LIVE_WEEKLY2_3M");
const summary: Record<string, unknown> = { tag: TAG, clientId, coach: coachEmail };

// コーチの予定が重ならないよう、生徒ごとに曜日をずらす（コーチの現地時刻 10:00〜10:25）
const slot = (dayOfWeek: number) => ({ dayOfWeek, startTime: "10:00", endTime: "10:25" });

// 生徒RA: 契約の終了まで10日・実施済み1回 → 評価の受付期間（終了14日前）
{
  const s = await createStudent("ra", "終了間近", WEEKLY1, 10);
  const scheduleId = await matchViaAdmin(adminClient, { ticketId: s.ticketId, coachId, slotNo: 1, ...slot(1) });
  const sessions = await listScheduledSessions(scheduleId);
  await backdateAsCompleted(sessions[0].session_id, 6);
  summary.ra = { email: s.email, expect: "評価のお願いが出る（終了14日前）" };
  console.log("生徒RA投入完了");
}

// 生徒RB: 週2回・2コマとも同じコーチ。実施済み1回・残りの予定はすべて生徒キャンセル → 予定が残っていない
{
  const s = await createStudent("rb", "予定なし・週2同一コーチ", WEEKLY2, 76);
  const schedule1 = await matchViaAdmin(adminClient, { ticketId: s.ticketId, coachId, slotNo: 1, ...slot(2) });
  const schedule2 = await matchViaAdmin(adminClient, { ticketId: s.ticketId, coachId, slotNo: 2, ...slot(3) });
  const [first, ...rest1] = await listScheduledSessions(schedule1);
  await backdateAsCompleted(first.session_id, 5);
  const studentClient = await signInAsRole(s.email, PASSWORD);
  for (const session of [...rest1, ...(await listScheduledSessions(schedule2))]) {
    await cancelAs(studentClient, session.session_id, "予定が合わないため");
  }
  await signOutRole(studentClient);
  summary.rb = { email: s.email, expect: "評価のお願いが1行だけ出る（予定が残っていない・同じコーチは1回）" };
  console.log("生徒RB投入完了");
}

// 生徒RC: 契約の終了まで10日・評価済み（実際の生徒のJWTで登録）
{
  const s = await createStudent("rc", "評価済み", WEEKLY1, 10);
  const scheduleId = await matchViaAdmin(adminClient, { ticketId: s.ticketId, coachId, slotNo: 1, ...slot(4) });
  const sessions = await listScheduledSessions(scheduleId);
  await backdateAsCompleted(sessions[0].session_id, 4);
  const studentClient = await signInAsRole(s.email, PASSWORD);
  const { error } = await studentClient.rpc("submit_coach_rating", {
    p_ticket_id: s.ticketId,
    p_coach_id: coachId,
    p_coaching_score: 5,
    p_friendliness_score: 5,
    p_recommendation_score: 4,
    p_feedback: "（テスト）レッスンの進め方が分かりやすかったです。運営向けのコメントです。",
  });
  if (error) throw error;
  await signOutRole(studentClient);
  summary.rc = { email: s.email, expect: "評価のお願いは出ない（評価済み）" };
  console.log("生徒RC投入完了");
}

// 生徒RD: 契約の終了まで76日・実施済み1回・予定が残っている → 受付期間前
{
  const s = await createStudent("rd", "受付前", WEEKLY1, 76);
  const scheduleId = await matchViaAdmin(adminClient, { ticketId: s.ticketId, coachId, slotNo: 1, ...slot(5) });
  const sessions = await listScheduledSessions(scheduleId);
  await backdateAsCompleted(sessions[0].session_id, 3);
  summary.rd = { email: s.email, expect: "評価のお願いは出ない（受付期間前）" };
  console.log("生徒RD投入完了");
}

// 生徒RE: 専属コーチ未選択 → 「専属コーチを探す」でコーチの星を確認する
{
  const s = await createStudent("re", "コーチ未選択", WEEKLY1, 76);
  summary.re = { email: s.email, expect: "専属コーチを探す で本タグのコーチに星（4.3・2件の評価）が出る" };
  console.log("生徒RE投入完了");
}

await signOutRole(adminClient);

const { data: stats } = await admin.from("com_t_coach_stats").select("rating_count, rating_overall_avg, rating_coaching_avg, rating_friendliness_avg").eq("coach_id", coachId).single();
summary.coachStats = stats;

console.log(`\n=== 投入完了 ===`);
console.log(JSON.stringify(summary, null, 2));
console.log("\nパスワードは QA_LIVE_SESSION_TEST_PASSWORD。確認後、coach-rating-cleanup.ts を同じ --env / --tag で実行してテストデータを削除してください。");
