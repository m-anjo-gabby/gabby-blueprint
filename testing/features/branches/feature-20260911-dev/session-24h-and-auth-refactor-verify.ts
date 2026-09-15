/**
 * session-24h-and-auth-refactor-seed.ts で投入したデータに対し、実際の業務RPCを該当ロールの
 * 実JWTで呼び出し(When)、結果(Then)を検証する。24時間ルールの成否・承認/承諾側での意図的な
 * 非再検証・18関数の権限チェック共通化(fn_assert_actor_or_admin/fn_assert_dual_actor_or_admin)・
 * 通知INSERT共通化(fn_notify)の回帰を確認する。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/session-24h-and-auth-refactor-verify.ts --env=dev --tag=authrefactor01
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { writeResultLog } from "../../../helpers/results.ts";
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

console.log(`\n=== 24時間ルール・権限共通化 検証: env=${env} tag=${TAG} ===`);

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK" : "NG"}: ${name}${detail ? ` (${detail})` : ""}`);
}
function isAuthError(message: string | undefined): boolean {
  return !!message && /not authorized/i.test(message);
}
function is24hError(message: string | undefined): boolean {
  return !!message && /24 hours/i.test(message);
}

// ---------------------------------------------------------------------------
// seed.tsが投入したユーザー・スケジュール・リクエストをemail/client_nameから再特定する
// ---------------------------------------------------------------------------
const { data: client } = await admin.from("com_m_client").select("client_id").eq("client_name", `【QAテスト】24時間ルール・権限共通化検証（${TAG}）`).single();
if (!client) throw new Error("対象クライアントが見つかりません。session-24h-and-auth-refactor-seed.tsを先に実行してください。");

async function findUserByEmail(email: string): Promise<string> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`ユーザーが見つかりません: ${email}`);
}

const coach1Email = `${TAG}-24h-coach1@gabby-qa-test.example`;
const coach2Email = `${TAG}-24h-coach2@gabby-qa-test.example`;
const t1Email = `${TAG}-24h-student-t1@gabby-qa-test.example`;
const t2Email = `${TAG}-24h-student-t2@gabby-qa-test.example`;
const t3Email = `${TAG}-24h-student-t3@gabby-qa-test.example`;
const t4Email = `${TAG}-24h-student-t4@gabby-qa-test.example`;
const adminEmail = "qa-admin@gabby-qa-test.example";

const coach1Id = await findUserByEmail(coach1Email);
const coach2Id = await findUserByEmail(coach2Email);
const t1Id = await findUserByEmail(t1Email);
const t2Id = await findUserByEmail(t2Email);
const t3Id = await findUserByEmail(t3Email);
const t4Id = await findUserByEmail(t4Email);

const coach1Client: SupabaseClient = await signInAsRole(coach1Email, PASSWORD);
const coach2Client: SupabaseClient = await signInAsRole(coach2Email, PASSWORD);
const t1Client: SupabaseClient = await signInAsRole(t1Email, PASSWORD);
const adminClient: SupabaseClient = await signInAsRole(adminEmail, PASSWORD);

console.log("対象ユーザー特定完了:", { coach1Id, coach2Id, t1Id, t2Id, t3Id, t4Id });

type ScheduleRow = { schedule_id: string; day_of_week: number; start_time: string; target_sessions: number };
async function getSchedule(coachId: string, studentId: string): Promise<ScheduleRow> {
  const { data, error } = await admin.from("com_m_lesson_schedule").select("schedule_id, day_of_week, start_time, target_sessions").eq("coach_id", coachId).eq("student_id", studentId).eq("status", 1).single();
  if (error) throw error;
  return data as ScheduleRow;
}

async function listScheduledSessions(scheduleId: string): Promise<{ session_id: string; start_datetime: string }[]> {
  const { data, error } = await admin.from("com_t_session").select("session_id, start_datetime").eq("schedule_id", scheduleId).eq("status", 1).order("start_datetime", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function hasNotification(userId: string, notificationType: string, sinceIso: string): Promise<boolean> {
  const { data, error } = await admin.from("com_t_notification").select("notification_id").eq("user_id", userId).eq("notification_type", notificationType).gte("insert_date", sinceIso);
  if (error) throw error;
  return (data ?? []).length > 0;
}

const t1Schedule = await getSchedule(coach1Id, t1Id);
const hours = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);

// ===========================================================================
// 1. create_session_booking_request: 24時間未満は拒否、24時間以上先は受理
// ===========================================================================
console.log("\n--- 1. create_session_booking_request 24時間ルール ---");
{
  const tooSoonStart = hours(10);
  const tooSoonEnd = hours(10.5);
  const { error } = await t1Client.rpc("create_session_booking_request", { p_schedule_id: t1Schedule.schedule_id, p_start_datetime: tooSoonStart.toISOString(), p_end_datetime: tooSoonEnd.toISOString() });
  check("create_session_booking_request: 開始10時間後は24時間ルール違反で拒否される", isAuthError(error?.message) === false && is24hError(error?.message), error?.message);
}

let bookingRequestId1: string;
{
  const start = hours(30);
  const end = hours(30.5);
  const { data, error } = await t1Client.rpc("create_session_booking_request", { p_schedule_id: t1Schedule.schedule_id, p_start_datetime: start.toISOString(), p_end_datetime: end.toISOString() });
  check("create_session_booking_request: 開始30時間後は成功する", !error, error?.message);
  bookingRequestId1 = data as string;
  const notified = await hasNotification(coach1Id, "SESSION_BOOKING_REQUESTED", new Date(Date.now() - 60_000).toISOString());
  check("create_session_booking_request: 担当コーチへSESSION_BOOKING_REQUESTED通知が作成される(fn_notify)", notified);
}

// ===========================================================================
// 2. approve_slot_proposal(旧approve_session_booking_request): 承認時に24時間を再チェックしない + 権限チェック
// ===========================================================================
console.log("\n--- 2. approve_slot_proposal(旧approve_session_booking_request): 承認時は24hを再チェックしない ---");
{
  // データ準備として、リクエストのproposed_start_datetimeを開始2時間後まで迫らせる
  // (「作成時点では24h以上先だったが、コーチの承認が遅れて猶予が減った」状況の再現)
  const nearStart = hours(2);
  const nearEnd = hours(2.5);
  const { error: updErr } = await admin.from("com_t_session_slot_proposal").update({ proposed_start_datetime: nearStart.toISOString(), proposed_end_datetime: nearEnd.toISOString() }).eq("proposal_id", bookingRequestId1);
  if (updErr) throw updErr;

  const { error: wrongCoachErr } = await coach2Client.rpc("approve_slot_proposal", { p_proposal_id: bookingRequestId1 });
  check("approve_slot_proposal: 無関係コーチC2は権限エラーになる", isAuthError(wrongCoachErr?.message), wrongCoachErr?.message);

  const beforeIso = new Date(Date.now() - 60_000).toISOString();
  const { data: newSessionId, error } = await coach1Client.rpc("approve_slot_proposal", { p_proposal_id: bookingRequestId1 });
  check("approve_slot_proposal: 開始2時間後でも担当コーチC1なら24hエラーにならず成功する(意図的に非再検証)", !error, error?.message);
  const { data: sessionRow } = await admin.from("com_t_session").select("status").eq("session_id", newSessionId as string).maybeSingle();
  check("approve_slot_proposal: 承認によりcom_t_sessionが確定(status=1)する", sessionRow?.status === 1, JSON.stringify(sessionRow));
  const notified = await hasNotification(t1Id, "SESSION_BOOKING_APPROVED", beforeIso);
  check("approve_slot_proposal: 生徒へSESSION_BOOKING_APPROVED通知が作成される(fn_notify)", notified);
}

// ===========================================================================
// 3. reject_slot_proposal(旧reject_session_booking_request) / withdraw_session_booking_request: 権限チェック
// ===========================================================================
console.log("\n--- 3. reject_slot_proposal / withdraw_session_booking_request 権限チェック ---");
{
  const start = hours(28);
  const end = hours(28.5);
  const { data: reqId, error: createErr } = await t1Client.rpc("create_session_booking_request", { p_schedule_id: t1Schedule.schedule_id, p_start_datetime: start.toISOString(), p_end_datetime: end.toISOString() });
  if (createErr) throw createErr;

  const { error: wrongCoachErr } = await coach2Client.rpc("reject_slot_proposal", { p_proposal_id: reqId as string, p_reason: "QA却下(不正)" });
  check("reject_slot_proposal: 無関係コーチC2は権限エラーになる", isAuthError(wrongCoachErr?.message), wrongCoachErr?.message);

  const beforeIso = new Date(Date.now() - 60_000).toISOString();
  const { error } = await coach1Client.rpc("reject_slot_proposal", { p_proposal_id: reqId as string, p_reason: "QA却下(正当)" });
  check("reject_slot_proposal: 担当コーチC1は成功する", !error, error?.message);
  const notified = await hasNotification(t1Id, "SESSION_BOOKING_REJECTED", beforeIso);
  check("reject_slot_proposal: 生徒へSESSION_BOOKING_REJECTED通知が作成される", notified);
}
{
  const start = hours(29);
  const end = hours(29.5);
  const { data: reqId, error: createErr } = await t1Client.rpc("create_session_booking_request", { p_schedule_id: t1Schedule.schedule_id, p_start_datetime: start.toISOString(), p_end_datetime: end.toISOString() });
  if (createErr) throw createErr;

  const { error: wrongRoleErr } = await coach1Client.rpc("withdraw_session_booking_request", { p_request_id: reqId as string });
  check("withdraw_session_booking_request: 担当コーチ(生徒本人でない)は権限エラーになる", isAuthError(wrongRoleErr?.message), wrongRoleErr?.message);

  const { error } = await t1Client.rpc("withdraw_session_booking_request", { p_request_id: reqId as string });
  check("withdraw_session_booking_request: 生徒本人は成功する", !error, error?.message);
}

// ===========================================================================
// 4. cancel_sessionの振替候補提案: 24時間未満拒否 + accept時は非再検証 + decline権限チェック
// ===========================================================================
console.log("\n--- 4. cancel_session振替候補: 24hルール・accept非再検証・decline権限 ---");
const t1SessionsForProposals = await listScheduledSessions(t1Schedule.schedule_id);
if (t1SessionsForProposals.length < 4) throw new Error(`生徒T1の予定セッションが不足しています(${t1SessionsForProposals.length}件、4件以上必要)`);

{
  // 4-1. 振替候補が24時間未満だと拒否される
  const target = t1SessionsForProposals[0];
  const proposedStart = hours(10);
  const proposedEnd = hours(10.5);
  const { error } = await t1Client.rpc("cancel_session", {
    p_session_id: target.session_id,
    p_reason: "QA振替候補(24h未満)",
    p_proposed_slots: [{ start_datetime: proposedStart.toISOString(), end_datetime: proposedEnd.toISOString() }],
  });
  check("cancel_session: 振替候補が開始10時間後だと24時間ルール違反で拒否される", is24hError(error?.message), error?.message);
}

let proposalId: string;
{
  // 4-2. 振替候補が24時間以上先なら受理される(生徒提案 → 応答者はコーチ)
  const target = t1SessionsForProposals[1];
  const proposedStart = hours(32);
  const proposedEnd = hours(32.5);
  const { error } = await t1Client.rpc("cancel_session", {
    p_session_id: target.session_id,
    p_reason: "QA振替候補(24h以上先)",
    p_proposed_slots: [{ start_datetime: proposedStart.toISOString(), end_datetime: proposedEnd.toISOString() }],
  });
  check("cancel_session: 振替候補が開始32時間後だと成功する", !error, error?.message);

  const { data: proposalRow, error: pErr } = await admin.from("com_t_session_slot_proposal").select("proposal_id, proposed_start_datetime").eq("source_session_id", target.session_id).eq("status", 1).single();
  if (pErr) throw pErr;
  proposalId = proposalRow.proposal_id as string;
  check("cancel_session: com_t_session_slot_proposalに候補が記録される", new Date(proposalRow.proposed_start_datetime).getTime() === proposedStart.getTime());
}

{
  // 4-3. approve_slot_proposal(旧accept_session_reschedule_proposal)は承諾時に24hを再チェックしない + 権限チェック
  const nearStart = hours(3);
  const nearEnd = hours(3.5);
  const { error: updErr } = await admin.from("com_t_session_slot_proposal").update({ proposed_start_datetime: nearStart.toISOString(), proposed_end_datetime: nearEnd.toISOString() }).eq("proposal_id", proposalId);
  if (updErr) throw updErr;

  const { error: wrongCoachErr } = await coach2Client.rpc("approve_slot_proposal", { p_proposal_id: proposalId });
  check("approve_slot_proposal: 無関係コーチC2は権限エラーになる", isAuthError(wrongCoachErr?.message), wrongCoachErr?.message);

  const { data: newSessionId, error } = await coach1Client.rpc("approve_slot_proposal", { p_proposal_id: proposalId });
  check("approve_slot_proposal: 開始3時間後でも担当コーチC1なら24hエラーにならず成功する(意図的に非再検証)", !error, error?.message);
  const { data: newSessionRow } = await admin.from("com_t_session").select("status").eq("session_id", newSessionId as string).maybeSingle();
  check("approve_slot_proposal: 承諾により新セッションが確定(status=1)する", newSessionRow?.status === 1, JSON.stringify(newSessionRow));
}

{
  // 4-4. reject_slot_proposal(旧decline_session_reschedule_proposals): コーチ提案 → 応答者は生徒。無関係コーチは拒否、生徒本人は成功
  const target = t1SessionsForProposals[2];
  const proposedStart = hours(33);
  const proposedEnd = hours(33.5);
  const { error: proposeErr } = await coach1Client.rpc("cancel_session", {
    p_session_id: target.session_id,
    p_reason: "QAコーチ提案の振替候補",
    p_proposed_slots: [{ start_datetime: proposedStart.toISOString(), end_datetime: proposedEnd.toISOString() }],
  });
  if (proposeErr) throw proposeErr;

  const { data: declineProposal, error: declineLookupErr } = await admin
    .from("com_t_session_slot_proposal")
    .select("proposal_id")
    .eq("source_session_id", target.session_id)
    .eq("status", 1)
    .single();
  if (declineLookupErr) throw declineLookupErr;

  const { error: wrongCoachErr } = await coach2Client.rpc("reject_slot_proposal", { p_proposal_id: declineProposal.proposal_id });
  check("reject_slot_proposal: 無関係コーチC2は権限エラーになる", isAuthError(wrongCoachErr?.message), wrongCoachErr?.message);

  const { error } = await t1Client.rpc("reject_slot_proposal", { p_proposal_id: declineProposal.proposal_id });
  check("reject_slot_proposal: 提案の応答者である生徒本人は成功する", !error, error?.message);
}

// ===========================================================================
// 5. cancel_session: 生徒/コーチ/アドミン代理いずれも成功、無関係な第三者は拒否
// ===========================================================================
console.log("\n--- 5. cancel_session 3-way(student/coach/admin) + 無関係コーチ拒否 ---");
{
  const target = t1SessionsForProposals[3];
  const { error: wrongCoachErr } = await coach2Client.rpc("cancel_session", { p_session_id: target.session_id, p_reason: "QA無関係コーチによるキャンセル(不正)" });
  check("cancel_session: 無関係コーチC2はキャンセルできず権限エラーになる", isAuthError(wrongCoachErr?.message), wrongCoachErr?.message);
}

const remaining = (await listScheduledSessions(t1Schedule.schedule_id)).filter((s) => new Date(s.start_datetime).getTime() - Date.now() >= 24 * 60 * 60 * 1000);
if (remaining.length < 3) throw new Error(`cancel_session 3-way検証用の予定セッションが不足しています(${remaining.length}件、3件以上必要)`);

{
  const { error } = await t1Client.rpc("cancel_session", { p_session_id: remaining[0].session_id, p_reason: "QA生徒本人キャンセル" });
  check("cancel_session: 生徒本人は成功する", !error, error?.message);
  const { data: row } = await admin.from("com_t_session").select("cancel_category").eq("session_id", remaining[0].session_id).single();
  check("cancel_session: 生徒本人キャンセルはcancel_category=1(student)", row?.cancel_category === 1, JSON.stringify(row));
}
{
  const { error } = await coach1Client.rpc("cancel_session", { p_session_id: remaining[1].session_id, p_reason: "QAコーチ本人キャンセル" });
  check("cancel_session: 担当コーチ本人は成功する", !error, error?.message);
  const { data: row } = await admin.from("com_t_session").select("cancel_category").eq("session_id", remaining[1].session_id).single();
  check("cancel_session: コーチ本人キャンセルはcancel_category=2(coach)", row?.cancel_category === 2, JSON.stringify(row));
}
{
  const beforeIso = new Date(Date.now() - 60_000).toISOString();
  const { error } = await adminClient.rpc("cancel_session", { p_session_id: remaining[2].session_id, p_reason: "QAアドミン代理キャンセル", p_admin_refund_ticket: true, p_as_admin: true });
  check("cancel_session: アドミン代理(p_admin_refund_ticket指定)は成功する", !error, error?.message);
  const { data: row } = await admin.from("com_t_session").select("cancel_category, ticket_refunded").eq("session_id", remaining[2].session_id).single();
  check("cancel_session: アドミン代理キャンセルはcancel_category=3(admin)、返還可否は明示指定どおり", row?.cancel_category === 3 && row?.ticket_refunded === true, JSON.stringify(row));
  const notifiedStudent = await hasNotification(t1Id, "SESSION_CANCELLED_BY_ADMIN", beforeIso);
  const notifiedCoach = await hasNotification(coach1Id, "SESSION_CANCELLED_BY_ADMIN", beforeIso);
  check("cancel_session: アドミン代理キャンセルは生徒・コーチ双方へSESSION_CANCELLED_BY_ADMIN通知が作成される(fn_notify 2回)", notifiedStudent && notifiedCoach);
}

// ===========================================================================
// 6. check_session_conflict: 当事者本人・アドミンのみ許可
// ===========================================================================
console.log("\n--- 6. check_session_conflict 権限チェック ---");
{
  const start = hours(48).toISOString();
  const end = hours(48.5).toISOString();
  const { error: selfErr } = await t1Client.rpc("check_session_conflict", { p_coach_id: coach1Id, p_student_id: t1Id, p_start_datetime: start, p_end_datetime: end });
  check("check_session_conflict: 生徒本人は成功する", !selfErr, selfErr?.message);

  const { error: thirdPartyErr } = await coach2Client.rpc("check_session_conflict", { p_coach_id: coach1Id, p_student_id: t1Id, p_start_datetime: start, p_end_datetime: end });
  check("check_session_conflict: 無関係コーチC2は権限エラーになる", isAuthError(thirdPartyErr?.message), thirdPartyErr?.message);

  const { error: adminErr } = await adminClient.rpc("check_session_conflict", { p_coach_id: coach1Id, p_student_id: t1Id, p_start_datetime: start, p_end_datetime: end });
  check("check_session_conflict: アドミンは成功する", !adminErr, adminErr?.message);
}

// ===========================================================================
// 7. reject_matching_request: 権限チェックと通知
// ===========================================================================
console.log("\n--- 7. reject_matching_request 権限チェック・通知 ---");
{
  const { data: pendingReq, error } = await t1Client
    .from("com_t_matching_request")
    .select("request_id")
    .eq("student_id", t1Id)
    .eq("coach_id", coach1Id)
    .eq("status", 1)
    .maybeSingle();
  // T1は既にマッチング済みのため、reject検証専用の新しい保留中リクエストをservice_roleで用意する
  // (対象コマは既に埋まっているため、別チケットの別枠として第2チケットを発行する)
  let requestId = pendingReq?.request_id as string | undefined;
  if (!requestId) {
    const STANDARD_PLAN = (await admin.from("com_m_contract_plan").select("*").eq("plan_code", "LIVE_WEEKLY1_3M").single()).data!;
    const { data: contract, error: cErr } = await admin
      .from("com_m_contract")
      .insert({
        client_id: client.client_id,
        plan_name: STANDARD_PLAN.plan_name,
        plan_name_en: STANDARD_PLAN.plan_name_en,
        plan_id: STANDARD_PLAN.plan_id,
        max_licenses: 1,
        start_date: new Date(Date.now() - 30 * 86400000).toISOString(),
        end_date: new Date(Date.now() + 335 * 86400000).toISOString(),
        status: 1,
        contract_type: STANDARD_PLAN.contract_type,
        weekly_frequency: STANDARD_PLAN.weekly_frequency,
        total_sessions: STANDARD_PLAN.total_sessions,
        has_dialogue_practice: STANDARD_PLAN.has_dialogue_practice,
        note: `QA自動テスト(${TAG}) 生徒T1 reject_matching_request検証用第2チケット`,
      })
      .select("contract_id")
      .single();
    if (cErr) throw cErr;
    const { data: license, error: lErr } = await admin
      .from("com_t_user_license")
      .insert({ contract_id: contract.contract_id, user_id: t1Id, status: 1, start_date: new Date(Date.now() - 30 * 86400000).toISOString(), end_date: new Date(Date.now() + 335 * 86400000).toISOString() })
      .select("license_id")
      .single();
    if (lErr) throw lErr;
    const { data: ticket, error: tErr } = await admin
      .from("com_t_user_session_ticket")
      .insert({ license_id: license.license_id, contract_id: contract.contract_id, user_id: t1Id, weekly_frequency: STANDARD_PLAN.weekly_frequency, total_sessions: STANDARD_PLAN.total_sessions, used_sessions: 0 })
      .select("ticket_id")
      .single();
    if (tErr) throw tErr;
    const { data: req, error: rErr } = await t1Client
      .from("com_t_matching_request")
      .insert({ ticket_id: ticket.ticket_id, student_id: t1Id, coach_id: coach1Id, slot_no: 1, requested_day_of_week: (t1Schedule.day_of_week + 1) % 7, requested_start_time: "08:00:00", requested_end_time: "08:30:00" })
      .select("request_id")
      .single();
    if (rErr) throw rErr;
    requestId = req.request_id as string;
  }
  if (error) throw error;

  const { error: wrongCoachErr } = await coach2Client.rpc("reject_matching_request", { p_request_id: requestId, p_reason: "QA否認(不正)" });
  check("reject_matching_request: 無関係コーチC2は権限エラーになる", isAuthError(wrongCoachErr?.message), wrongCoachErr?.message);

  const beforeIso = new Date(Date.now() - 60_000).toISOString();
  const { error: rejectErr } = await coach1Client.rpc("reject_matching_request", { p_request_id: requestId, p_reason: "QA否認理由(正当)" });
  check("reject_matching_request: 担当コーチC1は理由付きで成功する", !rejectErr, rejectErr?.message);
  const notified = await hasNotification(t1Id, "MATCHING_REJECTED", beforeIso);
  check("reject_matching_request: 生徒へMATCHING_REJECTED通知が作成される", notified);
}

// ===========================================================================
// 8. approve_matching_request: コーチ本人承認時のみ24hルール適用(当日分スキップ)
// ===========================================================================
console.log("\n--- 8. approve_matching_request 24時間ルール(当日分スキップ) ---");
{
  const { data: t2Req, error } = await admin.from("com_t_matching_request").select("request_id").eq("student_id", t2Id).eq("coach_id", coach1Id).eq("status", 1).single();
  if (error) throw error;

  const approveTimeMs = Date.now();
  const { data: t2ScheduleId, error: approveErr } = await coach1Client.rpc("approve_matching_request", { p_request_id: t2Req.request_id });
  check("approve_matching_request: 担当コーチC1による承認が成功する", !approveErr, approveErr?.message);

  const t2Sessions = await listScheduledSessions(t2ScheduleId as string);
  check("approve_matching_request: 生成されたセッションが1件以上ある", t2Sessions.length > 0, `count=${t2Sessions.length}`);
  const tooSoon = t2Sessions.filter((s) => new Date(s.start_datetime).getTime() < approveTimeMs + 24 * 60 * 60 * 1000);
  check(
    "approve_matching_request: 生成されたセッションに開始24時間未満のものが1件も無い(当日分はスキップされ翌週分から生成される)",
    tooSoon.length === 0,
    `tooSoon=${JSON.stringify(tooSoon)}`
  );
}

// ===========================================================================
// 9. admin_match_student_with_coach: 24時間ルール対象外(当日分も即生成)+ 権限チェック
// ===========================================================================
console.log("\n--- 9. admin_match_student_with_coach 24時間ルール対象外 + 権限チェック ---");
{
  const { data: t3Ticket, error } = await admin.from("com_t_user_session_ticket").select("ticket_id").eq("user_id", t3Id).single();
  if (error) throw error;

  const { error: wrongRoleErr } = await coach1Client.rpc("admin_match_student_with_coach", {
    p_ticket_id: t3Ticket.ticket_id,
    p_coach_id: coach1Id,
    p_slot_no: 1,
    p_day_of_week: 1,
    p_start_time: "10:00",
    p_end_time: "10:30",
  });
  check("admin_match_student_with_coach: コーチ本人は権限エラーになる(このRPCはアドミン専用)", isAuthError(wrongRoleErr?.message), wrongRoleErr?.message);

  // T2と同じ曜日(=当日中に最初の回が来る)だが、コーチのスケジュール重複を避けるため時間帯はずらす
  // (check_coach_schedule_conflictは同一コーチ・同一曜日の時間帯重なりを見るため、T2の10:00-10:30と
  // 同じ枠にT3を重ねるとSCHEDULE_CONFLICTで失敗してしまう)
  const { data: t3ScheduleId, error: matchErr } = await adminClient.rpc("admin_match_student_with_coach", {
    p_ticket_id: t3Ticket.ticket_id,
    p_coach_id: coach1Id,
    p_slot_no: 1,
    p_day_of_week: (await admin.from("com_m_lesson_schedule").select("day_of_week").eq("student_id", t2Id).single()).data!.day_of_week,
    p_start_time: "14:00",
    p_end_time: "14:30",
  });
  check("admin_match_student_with_coach: アドミンは成功する", !matchErr, matchErr?.message);

  const t3Sessions = await listScheduledSessions(t3ScheduleId as string);
  const nowMs = Date.now();
  const withinNext24h = t3Sessions.filter((s) => new Date(s.start_datetime).getTime() < nowMs + 24 * 60 * 60 * 1000);
  check(
    "admin_match_student_with_coach: アドミンは24時間ルールの対象外のため、開始24時間未満のセッションも実際に生成される",
    withinNext24h.length > 0,
    `generated=${t3Sessions.length}, withinNext24h=${withinNext24h.length}`
  );
}

// ===========================================================================
// 10. admin_reschedule_session / release_lesson_schedule_slot / invalidate_user_license:
//     アドミン専用(コーチは拒否される)
// ===========================================================================
console.log("\n--- 10. アドミン専用RPC(admin_reschedule_session/release_lesson_schedule_slot/invalidate_user_license) ---");
const t4Schedule = await getSchedule(coach1Id, t4Id);
{
  const t4Sessions = await listScheduledSessions(t4Schedule.schedule_id);
  if (t4Sessions.length < 1) throw new Error("生徒T4の予定セッションがありません");
  const target = t4Sessions[0];
  const newStart = new Date(new Date(target.start_datetime).getTime() + 60 * 60 * 1000);
  const newEnd = new Date(newStart.getTime() + 30 * 60 * 1000);

  const { error: wrongRoleErr } = await coach1Client.rpc("admin_reschedule_session", { p_session_id: target.session_id, p_new_start_datetime: newStart.toISOString(), p_new_end_datetime: newEnd.toISOString() });
  check("admin_reschedule_session: 担当コーチC1は権限エラーになる(アドミン専用)", isAuthError(wrongRoleErr?.message), wrongRoleErr?.message);

  const beforeIso = new Date(Date.now() - 60_000).toISOString();
  const { error } = await adminClient.rpc("admin_reschedule_session", { p_session_id: target.session_id, p_new_start_datetime: newStart.toISOString(), p_new_end_datetime: newEnd.toISOString(), p_reason: "QAアドミン日時変更" });
  check("admin_reschedule_session: アドミンは成功する", !error, error?.message);
  const notifiedStudent = await hasNotification(t4Id, "SESSION_UPDATED_BY_ADMIN", beforeIso);
  const notifiedCoach = await hasNotification(coach1Id, "SESSION_UPDATED_BY_ADMIN", beforeIso);
  check("admin_reschedule_session: 生徒・コーチ双方へSESSION_UPDATED_BY_ADMIN通知が作成される(fn_notify 2回)", notifiedStudent && notifiedCoach);
}
{
  const { error: wrongRoleErr } = await coach1Client.rpc("release_lesson_schedule_slot", { p_schedule_id: t4Schedule.schedule_id });
  check("release_lesson_schedule_slot: 担当コーチC1は権限エラーになる(アドミン専用)", isAuthError(wrongRoleErr?.message), wrongRoleErr?.message);

  const { error } = await adminClient.rpc("release_lesson_schedule_slot", { p_schedule_id: t4Schedule.schedule_id });
  check("release_lesson_schedule_slot: アドミンは成功する", !error, error?.message);
  const { data: scheduleRow } = await admin.from("com_m_lesson_schedule").select("status").eq("schedule_id", t4Schedule.schedule_id).single();
  check("release_lesson_schedule_slot: スケジュールがstatus=9(terminated)になる", scheduleRow?.status === 9, `status=${scheduleRow?.status}`);
}
{
  const { data: t4License, error } = await admin.from("com_t_user_license").select("license_id").eq("user_id", t4Id).single();
  if (error) throw error;

  const { error: wrongRoleErr } = await coach1Client.rpc("invalidate_user_license", { p_license_id: t4License.license_id });
  check("invalidate_user_license: 担当コーチC1は権限エラーになる(アドミン専用)", isAuthError(wrongRoleErr?.message), wrongRoleErr?.message);

  const { error: invalidateErr } = await adminClient.rpc("invalidate_user_license", { p_license_id: t4License.license_id });
  check("invalidate_user_license: アドミンは成功する", !invalidateErr, invalidateErr?.message);
  const { data: licenseRow } = await admin.from("com_t_user_license").select("status").eq("license_id", t4License.license_id).single();
  check("invalidate_user_license: ライセンスがstatus=0(停止)になる", licenseRow?.status === 0, `status=${licenseRow?.status}`);
}

// ===========================================================================
// 11. get_coach_monthly_sessions / get_coach_monthly_active_students: 本人・アドミンのみ
// ===========================================================================
console.log("\n--- 11. get_coach_monthly_sessions / get_coach_monthly_active_students 権限チェック ---");
{
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const { error: selfErr } = await coach1Client.rpc("get_coach_monthly_sessions", { p_coach_id: coach1Id, p_report_month: month });
  check("get_coach_monthly_sessions: コーチ本人は成功する", !selfErr, selfErr?.message);

  const { error: thirdPartyErr } = await coach2Client.rpc("get_coach_monthly_sessions", { p_coach_id: coach1Id, p_report_month: month });
  check("get_coach_monthly_sessions: 無関係コーチC2は権限エラーになる", isAuthError(thirdPartyErr?.message), thirdPartyErr?.message);

  const { error: adminErr } = await adminClient.rpc("get_coach_monthly_sessions", { p_coach_id: coach1Id, p_report_month: month });
  check("get_coach_monthly_sessions: アドミンは成功する", !adminErr, adminErr?.message);

  const { error: activeSelfErr } = await coach1Client.rpc("get_coach_monthly_active_students", { p_coach_id: coach1Id, p_report_month: month });
  check("get_coach_monthly_active_students: コーチ本人は成功する", !activeSelfErr, activeSelfErr?.message);

  const { error: activeThirdPartyErr } = await coach2Client.rpc("get_coach_monthly_active_students", { p_coach_id: coach1Id, p_report_month: month });
  check("get_coach_monthly_active_students: 無関係コーチC2は権限エラーになる", isAuthError(activeThirdPartyErr?.message), activeThirdPartyErr?.message);
}

// ---------------------------------------------------------------------------
console.log("\n=== 検証結果 ===");
console.table(checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail ?? "" })));

await coach1Client.auth.signOut();
await coach2Client.auth.signOut();
await t1Client.auth.signOut();
await adminClient.auth.signOut();

const log = writeResultLog({
  scenario: "features/branches/feature-20260911-dev/session-24h-and-auth-refactor.feature",
  env,
  tag: TAG,
  checks,
});

console.log(`\n検証完了後は session-24h-and-auth-refactor-cleanup.ts を同じ --env / --tag で実行し、テストデータを削除してください。`);

if (!log.ok) {
  console.error(`\nNG: ${log.failed}件の不整合`);
  process.exit(1);
} else {
  console.log(`\nOK: 全${log.totalChecks}件のチェックに合格`);
}
