/**
 * feature/20260911-dev のうち、本セッションで実装した以下2件のデータ主体テスト(②)投入スクリプト。
 *   1. com_m_lesson_schedule.target_sessions（コマ別セッション目標数の均等割り・生成上限・
 *      マッチング遅延によるエンタイトルメント不足の可視化）
 *   2. com_t_session.status簡素化（scheduled/completed/cancelledの3値化 + completion_result/
 *      cancel_categoryへの分離）
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/session-lifecycle-refactor-seed.ts --env=dev --tag=lifecycle01
 *
 * テスト完了後にデータを削除する運用のため（ユーザー指示）、cleanup用に
 * session-lifecycle-refactor-cleanup.ts を用意している。verify.ts実行後に実行すること。
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

console.log(`\n=== feature/20260911-dev セッションライフサイクル刷新②シナリオ投入: env=${env} tag=${TAG} ===`);

// ---------------------------------------------------------------------------
// Preflight: 本シナリオが対象とするRPC群が反映済みか確認
// ---------------------------------------------------------------------------
await assertReleaseApplied(admin, [
  { name: "admin_match_student_with_coach", dummyArgs: { p_ticket_id: "00000000-0000-0000-0000-000000000000", p_coach_id: "00000000-0000-0000-0000-000000000000", p_slot_no: 1, p_day_of_week: 1, p_start_time: "10:00", p_end_time: "10:30" } },
  { name: "fn_schedule_shortfall", dummyArgs: { p_schedule_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "finalize_session", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "resolve_stale_session", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000", p_completion_result: 1, p_reason: "preflight" } },
  { name: "cancel_session", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "admin_reschedule_session", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000", p_new_start_datetime: TODAY.toISOString(), p_new_end_datetime: TODAY.toISOString() } },
  { name: "release_lesson_schedule_slot", dummyArgs: { p_schedule_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "invalidate_user_license", dummyArgs: { p_license_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "get_coach_monthly_sessions", dummyArgs: { p_coach_id: "00000000-0000-0000-0000-000000000000", p_report_month: "2020-01-01" } },
]);
console.log("Preflight OK: 対象RPCはすべて反映済みです。");

// resolve_stale_sessionの新シグネチャ(p_completion_result)が反映されているかも別途確認する
// （旧p_resolved_statusのままだとPGRST202でここに到達しない=assertReleaseAppliedで検出済みのはずだが、
// 型名一致まではPostgRESTのスキーマキャッシュ次第のため、念のため明示的な軽い動作確認を残す）
{
  const { error } = await admin.rpc("resolve_stale_session", {
    p_session_id: "00000000-0000-0000-0000-000000000000",
    p_completion_result: 99, // 業務的に無効な値。'invalid completion result'で失敗すれば新シグネチャで受理されている証拠
    p_reason: "preflight-signature-check",
  });
  if (error?.code === "PGRST202") {
    throw new Error("resolve_stale_session が旧シグネチャ(p_resolved_status)のままのようです。リリースSQLの適用状況を確認してください。");
  }
}
console.log("Preflight OK: resolve_stale_session は新シグネチャ(p_completion_result)で受理されています。");

// ---------------------------------------------------------------------------
// 共通ヘルパー
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

/** ticketのweekly_frequency/total_sessionsをテスト用に上書きする（target_sessionsの端数配分検証のため、
 * 標準プランに存在しない週3回25セッションのような組み合わせを作るのに使う。admin_match_student_with_coach
 * はcom_t_user_session_ticketの値のみを参照するため、契約側(com_m_contract)の値と不一致でも支障ない）。 */
async function overrideTicketEntitlement(ticketId: string, weeklyFrequency: number, totalSessions: number): Promise<void> {
  const { error } = await admin.from("com_t_user_session_ticket").update({ weekly_frequency: weeklyFrequency, total_sessions: totalSessions }).eq("ticket_id", ticketId);
  if (error) throw error;
}

/** admin_match_student_with_coach経由で1コマをマッチングさせ、生成されたschedule_idを返す。 */
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

/** 生成済みcom_t_sessionのうち、指定scheduleに紐づくstatus=1の行をstart_datetime昇順で取得する。 */
async function listScheduledSessions(scheduleId: string): Promise<{ session_id: string; start_datetime: string; end_datetime: string }[]> {
  const { data, error } = await admin.from("com_t_session").select("session_id, start_datetime, end_datetime").eq("schedule_id", scheduleId).eq("status", 1).order("start_datetime", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** cancel_session等の対象として使う、任意時刻のstatus=1セッションを直接投入する（KJ-2026-0910-01のハイブリッド方式）。 */
async function seedDirectSession(params: { scheduleId: string; ticketId: string; studentId: string; coachId: string; start: Date; end: Date }): Promise<string> {
  const { data, error } = await admin
    .from("com_t_session")
    .insert({
      schedule_id: params.scheduleId,
      ticket_id: params.ticketId,
      student_id: params.studentId,
      coach_id: params.coachId,
      start_datetime: params.start.toISOString(),
      end_datetime: params.end.toISOString(),
      status: 1,
    })
    .select("session_id")
    .single();
  if (error) throw error;
  return data.session_id as string;
}

async function seedCallLog(sessionId: string, userId: string, role: "coach" | "student", joined: Date, left: Date): Promise<void> {
  const { error } = await admin.from("com_t_session_call_log").insert({ session_id: sessionId, user_id: userId, role, joined_at: joined.toISOString(), left_at: left.toISOString() });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// 共通セットアップ: 顧客・コーチ・アドミン
// ---------------------------------------------------------------------------
const clientId = await ensureClient(`【QAテスト】セッションライフサイクル刷新検証（${TAG}）`);
const coachEmail = `${TAG}-lifecycle-coach@gabby-qa-test.example`;
const coachId = await ensureUser(coachEmail, "2", `QAコーチ（ライフサイクル・${TAG}）`, clientId);

const adminEmail = "qa-admin@gabby-qa-test.example";
let adminUserId = await findAuthUserByEmail(adminEmail);
if (!adminUserId) {
  adminUserId = await ensureUser(adminEmail, "0", "QAアドミン（代理操作用）", null);
} else {
  await admin.from("com_m_user").update({ user_type: "0" }).eq("id", adminUserId);
}

const adminClient: SupabaseClient = await signInAsRole(adminEmail, PASSWORD);
const coachClient: SupabaseClient = await signInAsRole(coachEmail, PASSWORD);

console.log("共通セットアップ完了:", { clientId, coachId, adminUserId });

const STANDARD = await getPlan("LIVE_WEEKLY1_3M");
const BUSINESS_PRO = await getPlan("LIVE_WEEKLY2_3M");

const summary: Record<string, unknown> = { tag: TAG, clientId, coachId, coachEmail };

// ---------------------------------------------------------------------------
// 生徒SA: target_sessions均等割り・生成上限の検証（週3回25セッション、余りはslot_no昇順）
// ---------------------------------------------------------------------------
console.log("\n--- 生徒SA: target_sessions均等割り(9/8/8)・生成上限 ---");
const saId = await ensureUser(`${TAG}-lifecycle-student-sa@gabby-qa-test.example`, "1", `QA生徒SA（target_sessions・${TAG}）`, clientId);
const saStart = addDays(TODAY, -30);
const saEnd = addDays(TODAY, 335); // 長期のライセンス。生成上限がend_dateではなくtarget_sessionsで効くことを確認する
const { ticketId: saTicketId } = await createContractLicenseTicket({ clientId, userId: saId, plan: BUSINESS_PRO, startDate: saStart, endDate: saEnd, note: `QA自動テスト(${TAG}) 生徒SA target_sessions` });
await overrideTicketEntitlement(saTicketId, 3, 25); // 標準プランに無い週3回25セッションへ上書き(9/8/8になるはず)

const saSchedule1 = await matchViaAdmin(adminClient, { ticketId: saTicketId, coachId, slotNo: 1, dayOfWeek: 1, startTime: "09:00", endTime: "09:30" });
const saSchedule2 = await matchViaAdmin(adminClient, { ticketId: saTicketId, coachId, slotNo: 2, dayOfWeek: 2, startTime: "09:00", endTime: "09:30" });
const saSchedule3 = await matchViaAdmin(adminClient, { ticketId: saTicketId, coachId, slotNo: 3, dayOfWeek: 3, startTime: "09:00", endTime: "09:30" });
console.log("生徒SA投入完了:", { saTicketId, saSchedule1, saSchedule2, saSchedule3 });

// ---------------------------------------------------------------------------
// 生徒SB: マッチング遅延によるエンタイトルメント不足がshortfallとして可視化されることの検証
// ---------------------------------------------------------------------------
console.log("\n--- 生徒SB: 遅延マッチングによるshortfall可視化(target=12だが実際は2回分しか入らない) ---");
const sbId = await ensureUser(`${TAG}-lifecycle-student-sb@gabby-qa-test.example`, "1", `QA生徒SB（shortfall・${TAG}）`, clientId);
const sbStart = addDays(TODAY, -80); // 契約開始はとうに過ぎている
const sbEnd = addDays(TODAY, 10); // ライセンス終了まであと10日しかない(admin_match_student_with_coachは開始日をCURRENT_DATEにクランプする)
const { ticketId: sbTicketId } = await createContractLicenseTicket({ clientId, userId: sbId, plan: BUSINESS_PRO, startDate: sbStart, endDate: sbEnd, note: `QA自動テスト(${TAG}) 生徒SB shortfall` });
// 今日から+2日後の曜日を狙うと、+2日と+9日の2回だけが10日間の生成ウィンドウに収まり、決定的に actual=2 になる
const sbDayOfWeek = addDays(TODAY, 2).getUTCDay();
const sbSchedule = await matchViaAdmin(adminClient, { ticketId: sbTicketId, coachId, slotNo: 1, dayOfWeek: sbDayOfWeek, startTime: "11:00", endTime: "11:30" });
console.log("生徒SB投入完了:", { sbTicketId, sbSchedule, sbDayOfWeek });

// ---------------------------------------------------------------------------
// 生徒SC: completion_result(normal/early_ended/no_show) + resolve_stale_session + 月次レポート
// ---------------------------------------------------------------------------
console.log("\n--- 生徒SC: finalize_session/resolve_stale_sessionの内訳(completion_result) ---");
const scId = await ensureUser(`${TAG}-lifecycle-student-sc@gabby-qa-test.example`, "1", `QA生徒SC（completion_result・${TAG}）`, clientId);
const scStart = addDays(TODAY, -30);
const scEnd = addDays(TODAY, 335);
const { ticketId: scTicketId } = await createContractLicenseTicket({ clientId, userId: scId, plan: STANDARD, startDate: scStart, endDate: scEnd, note: `QA自動テスト(${TAG}) 生徒SC completion_result` });
const scSchedule = await matchViaAdmin(adminClient, { ticketId: scTicketId, coachId, slotNo: 1, dayOfWeek: 5, startTime: "10:00", endTime: "10:30" });
const scFutureSessions = await listScheduledSessions(scSchedule);
if (scFutureSessions.length < 3) throw new Error(`生徒SCの生成セッション数が不足しています(${scFutureSessions.length}件)`);

// finalize_session対象の3件に、意図した重複時間のcall_logを直接投入する
// (com_t_session_call_logへのINSERTはRPC経由のみ許可されているため、テストデータ投入としてservice_roleで直接書き込む)
const scNormalSessionId = scFutureSessions[0].session_id;
const scEarlyEndedSessionId = scFutureSessions[1].session_id;
const scNoShowSessionId = scFutureSessions[2].session_id;

const scNormalStart = new Date(scFutureSessions[0].start_datetime);
await seedCallLog(scNormalSessionId, coachId, "coach", scNormalStart, new Date(scNormalStart.getTime() + 30 * 60 * 1000));
await seedCallLog(scNormalSessionId, scId, "student", scNormalStart, new Date(scNormalStart.getTime() + 30 * 60 * 1000)); // 30分重複 → normal

const scEarlyStart = new Date(scFutureSessions[1].start_datetime);
await seedCallLog(scEarlyEndedSessionId, coachId, "coach", scEarlyStart, new Date(scEarlyStart.getTime() + 10 * 60 * 1000));
await seedCallLog(scEarlyEndedSessionId, scId, "student", scEarlyStart, new Date(scEarlyStart.getTime() + 10 * 60 * 1000)); // 10分重複・生徒入室あり → early_ended

const scNoShowStart = new Date(scFutureSessions[2].start_datetime);
await seedCallLog(scNoShowSessionId, coachId, "coach", scNoShowStart, new Date(scNoShowStart.getTime() + 5 * 60 * 1000)); // 生徒の入室ログなし → no_show

// resolve_stale_session対象(過去に終了予定時刻を過ぎたままのscheduled)を直接投入する
const scPastNormalStart = addDays(TODAY, -3);
const scPastNormalEnd = new Date(scPastNormalStart.getTime() + 30 * 60 * 1000);
const scPastNormalSessionId = await seedDirectSession({ scheduleId: scSchedule, ticketId: scTicketId, studentId: scId, coachId, start: scPastNormalStart, end: scPastNormalEnd });

const scPastEarlyStart = addDays(TODAY, -2);
const scPastEarlyEnd = new Date(scPastEarlyStart.getTime() + 30 * 60 * 1000);
const scPastEarlySessionId = await seedDirectSession({ scheduleId: scSchedule, ticketId: scTicketId, studentId: scId, coachId, start: scPastEarlyStart, end: scPastEarlyEnd });

console.log("生徒SC投入完了:", { scTicketId, scSchedule, scNormalSessionId, scEarlyEndedSessionId, scNoShowSessionId, scPastNormalSessionId, scPastEarlySessionId });

// ---------------------------------------------------------------------------
// 生徒SD: cancel_session(cancel_category)・admin_reschedule_sessionの検証
// ---------------------------------------------------------------------------
console.log("\n--- 生徒SD: cancel_session(student/coach/admin)・admin_reschedule_session ---");
const sdId = await ensureUser(`${TAG}-lifecycle-student-sd@gabby-qa-test.example`, "1", `QA生徒SD（cancel_category・${TAG}）`, clientId);
const sdStart = addDays(TODAY, -30);
const sdEnd = addDays(TODAY, 335);
const { ticketId: sdTicketId } = await createContractLicenseTicket({ clientId, userId: sdId, plan: STANDARD, startDate: sdStart, endDate: sdEnd, note: `QA自動テスト(${TAG}) 生徒SD cancel_category` });
const sdSchedule = await matchViaAdmin(adminClient, { ticketId: sdTicketId, coachId, slotNo: 1, dayOfWeek: 6, startTime: "10:00", endTime: "10:30" });
const sdFutureSessions = await listScheduledSessions(sdSchedule);
if (sdFutureSessions.length < 5) throw new Error(`生徒SDの生成セッション数が不足しています(${sdFutureSessions.length}件)`);

const sdStudentCancelFar = sdFutureSessions[0].session_id; // 12時間以上前キャンセル
const sdCoachCancel = sdFutureSessions[1].session_id;
const sdAdminReschedule = sdFutureSessions[2].session_id;
const sdAdminCancelRefundTrue = sdFutureSessions[3].session_id;
const sdAdminCancelRefundFalse = sdFutureSessions[4].session_id;

// 12時間以内キャンセル用に、開始まで6時間の枠を別途直接投入する
const sdNearStart = new Date(TODAY.getTime() + 6 * 60 * 60 * 1000);
const sdNearEnd = new Date(sdNearStart.getTime() + 30 * 60 * 1000);
const sdStudentCancelNear = await seedDirectSession({ scheduleId: sdSchedule, ticketId: sdTicketId, studentId: sdId, coachId, start: sdNearStart, end: sdNearEnd });

console.log("生徒SD投入完了:", { sdTicketId, sdSchedule, sdStudentCancelFar, sdStudentCancelNear, sdCoachCancel, sdAdminReschedule, sdAdminCancelRefundTrue, sdAdminCancelRefundFalse });

// ---------------------------------------------------------------------------
// 生徒SE: release_lesson_schedule_slot（コーチ交代）の検証
// ---------------------------------------------------------------------------
console.log("\n--- 生徒SE: release_lesson_schedule_slot(コーチ交代) ---");
const seId = await ensureUser(`${TAG}-lifecycle-student-se@gabby-qa-test.example`, "1", `QA生徒SE（コーチ交代・${TAG}）`, clientId);
const seStart = addDays(TODAY, -30);
const seEnd = addDays(TODAY, 335);
const { ticketId: seTicketId } = await createContractLicenseTicket({ clientId, userId: seId, plan: STANDARD, startDate: seStart, endDate: seEnd, note: `QA自動テスト(${TAG}) 生徒SE コーチ交代` });
const seSchedule = await matchViaAdmin(adminClient, { ticketId: seTicketId, coachId, slotNo: 1, dayOfWeek: 0, startTime: "10:00", endTime: "10:30" });
console.log("生徒SE投入完了:", { seTicketId, seSchedule });

// ---------------------------------------------------------------------------
// 生徒SF: invalidate_user_license（ライセンス無効化）の検証
// ---------------------------------------------------------------------------
console.log("\n--- 生徒SF: invalidate_user_license(ライセンス無効化) ---");
const sfId = await ensureUser(`${TAG}-lifecycle-student-sf@gabby-qa-test.example`, "1", `QA生徒SF（ライセンス無効化・${TAG}）`, clientId);
const sfStart = addDays(TODAY, -30);
const sfEnd = addDays(TODAY, 335);
const { licenseId: sfLicenseId, ticketId: sfTicketId } = await createContractLicenseTicket({ clientId, userId: sfId, plan: STANDARD, startDate: sfStart, endDate: sfEnd, note: `QA自動テスト(${TAG}) 生徒SF ライセンス無効化` });
const sfSchedule = await matchViaAdmin(adminClient, { ticketId: sfTicketId, coachId, slotNo: 1, dayOfWeek: 1, startTime: "14:00", endTime: "14:30" });
console.log("生徒SF投入完了:", { sfTicketId, sfLicenseId, sfSchedule });

// ---------------------------------------------------------------------------
// サインアウト(投入したDBデータ自体は削除しない。verify.ts→cleanup.tsの順で後始末する)
// ---------------------------------------------------------------------------
await adminClient.auth.signOut();
await coachClient.auth.signOut();

Object.assign(summary, {
  saId, saTicketId, saSchedule1, saSchedule2, saSchedule3,
  sbId, sbTicketId, sbSchedule, sbDayOfWeek,
  scId, scTicketId, scSchedule, scNormalSessionId, scEarlyEndedSessionId, scNoShowSessionId, scPastNormalSessionId, scPastEarlySessionId,
  sdId, sdTicketId, sdSchedule, sdStudentCancelFar, sdStudentCancelNear, sdCoachCancel, sdAdminReschedule, sdAdminCancelRefundTrue, sdAdminCancelRefundFalse,
  seId, seTicketId, seSchedule,
  sfId, sfTicketId, sfLicenseId, sfSchedule,
});

console.log(`\n=== 投入完了 ===`);
console.log(JSON.stringify(summary, null, 2));
console.log("\n次のステップ: session-lifecycle-refactor-verify.ts を同じ --env / --tag で実行してください。");
console.log("検証完了後、session-lifecycle-refactor-cleanup.ts を同じ --env / --tag で実行してテストデータを削除してください。");
