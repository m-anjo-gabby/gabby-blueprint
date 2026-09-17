/**
 * feature/20260911-dev のうち、本セッションで実装した以下2件のデータ主体テスト(②)投入スクリプト。
 *   1. 24時間ルール（個別予約・振替候補提案・マッチング承認の初回セッション）
 *   2. 権限チェック・通知INSERTの共通ヘルパー化（fn_assert_actor_or_admin/
 *      fn_assert_dual_actor_or_admin/fn_notify）による18関数リファクタの回帰確認
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/session-24h-and-auth-refactor-seed.ts --env=dev --tag=authrefactor01
 *
 * テスト完了後にデータを削除する運用のため（ユーザー指示）、cleanup用に
 * session-24h-and-auth-refactor-cleanup.ts を用意している。verify.ts実行後に実行すること。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { assertReleaseApplied, assertRpcRemoved } from "../../../helpers/preflight.ts";
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

console.log(`\n=== feature/20260911-dev 24時間ルール・権限共通化②シナリオ投入: env=${env} tag=${TAG} ===`);

// ---------------------------------------------------------------------------
// Preflight: 本シナリオが対象とするRPC群が反映済みか確認
// （fn_assert_actor_or_admin等の内部ヘルパーはauthenticated/service_roleいずれからも
//   直接EXECUTE権限が無い設計のため、preflightの対象は外側の公開RPCのみとする）
// ---------------------------------------------------------------------------
await assertReleaseApplied(admin, [
  { name: "create_session_booking_request", dummyArgs: { p_schedule_id: "00000000-0000-0000-0000-000000000000", p_start_datetime: TODAY.toISOString(), p_end_datetime: TODAY.toISOString() } },
  { name: "approve_slot_proposal", dummyArgs: { p_proposal_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "reject_slot_proposal", dummyArgs: { p_proposal_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "withdraw_session_booking_request", dummyArgs: { p_request_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "cancel_session", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "check_session_conflict", dummyArgs: { p_coach_id: "00000000-0000-0000-0000-000000000000", p_student_id: "00000000-0000-0000-0000-000000000000", p_start_datetime: TODAY.toISOString(), p_end_datetime: TODAY.toISOString() } },
  { name: "reject_matching_request", dummyArgs: { p_request_id: "00000000-0000-0000-0000-000000000000", p_reason: "preflight" } },
  { name: "approve_matching_request", dummyArgs: { p_request_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "admin_match_student_with_coach", dummyArgs: { p_ticket_id: "00000000-0000-0000-0000-000000000000", p_coach_id: "00000000-0000-0000-0000-000000000000", p_slot_no: 1, p_day_of_week: 1, p_start_time: "10:00", p_end_time: "10:30" } },
  { name: "admin_book_session_direct", dummyArgs: { p_schedule_id: "00000000-0000-0000-0000-000000000000", p_start_datetime: TODAY.toISOString(), p_end_datetime: TODAY.toISOString() } },
  { name: "release_lesson_schedule_slot", dummyArgs: { p_schedule_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "invalidate_user_license", dummyArgs: { p_license_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "get_coach_monthly_sessions", dummyArgs: { p_coach_id: "00000000-0000-0000-0000-000000000000", p_report_month: "2020-01-01" } },
  { name: "get_coach_monthly_active_students", dummyArgs: { p_coach_id: "00000000-0000-0000-0000-000000000000", p_report_month: "2020-01-01" } },
]);
console.log("Preflight OK: 対象RPCはすべて反映済みです。");

// スロット提案統合(com_t_session_reschedule_proposal+com_t_session_booking_request→
// com_t_session_slot_proposal)により廃止されたRPCが、本当に削除されているかも確認する
// （KJ-2026-0912-01: 42883だけでなくPGRST202も見る必要がある。assertRpcRemovedはその対応済み）
await assertRpcRemoved(admin, [
  { name: "approve_session_booking_request", dummyArgs: { p_request_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "reject_session_booking_request", dummyArgs: { p_request_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "accept_session_reschedule_proposal", dummyArgs: { p_proposal_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "decline_session_reschedule_proposals", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000" } },
  // アドミンの振替も生徒・コーチと同じ「キャンセル＋予約」の2操作に統一したため廃止(2026-09-15)
  { name: "admin_reschedule_session", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000", p_new_start_datetime: TODAY.toISOString(), p_new_end_datetime: TODAY.toISOString() } },
]);
console.log("Preflight OK: 廃止されたRPCはすべて削除済みです。");

// ---------------------------------------------------------------------------
// 共通ヘルパー（session-lifecycle-refactor-seed.tsと同等のもの）
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
  const { error: updErr } = await admin.from("com_m_user").update({ client_id: clientId, user_type: userType, user_name: userName, timezone: "Asia/Tokyo" }).eq("id", userId);
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

async function listScheduledSessions(scheduleId: string): Promise<{ session_id: string; start_datetime: string; end_datetime: string }[]> {
  const { data, error } = await admin.from("com_t_session").select("session_id, start_datetime, end_datetime").eq("schedule_id", scheduleId).eq("status", 1).order("start_datetime", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 生徒本人JWTで、>=12時間先の予定セッションを1件キャンセルし、未割当枠(shortfall)を1つ生成する。 */
async function freeUpOneShortfallSlot(studentClient: SupabaseClient, scheduleId: string): Promise<void> {
  const sessions = await listScheduledSessions(scheduleId);
  const farEnough = sessions.find((s) => new Date(s.start_datetime).getTime() - Date.now() >= 24 * 60 * 60 * 1000);
  if (!farEnough) throw new Error(`shortfall作成用に十分先の予定セッションが見つかりません(schedule=${scheduleId})`);
  const { error } = await studentClient.rpc("cancel_session", { p_session_id: farEnough.session_id, p_reason: "QA自動テスト: shortfall作成用の事前キャンセル" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// 共通セットアップ: 顧客・コーチ2名・アドミン
// ---------------------------------------------------------------------------
const clientId = await ensureClient(`【QAテスト】24時間ルール・権限共通化検証（${TAG}）`);
const coach1Email = `${TAG}-24h-coach1@gabby-qa-test.example`;
const coach1Id = await ensureUser(coach1Email, "2", `QAコーチC1（担当・${TAG}）`, clientId);
const coach2Email = `${TAG}-24h-coach2@gabby-qa-test.example`;
const coach2Id = await ensureUser(coach2Email, "2", `QAコーチC2（無関係・${TAG}）`, clientId);

const adminEmail = "qa-admin@gabby-qa-test.example";
let adminUserId = await findAuthUserByEmail(adminEmail);
if (!adminUserId) {
  adminUserId = await ensureUser(adminEmail, "0", "QAアドミン（代理操作用）", null);
} else {
  await admin.from("com_m_user").update({ user_type: "0" }).eq("id", adminUserId);
}

const adminClient: SupabaseClient = await signInAsRole(adminEmail, PASSWORD);
const coach1Client: SupabaseClient = await signInAsRole(coach1Email, PASSWORD);

console.log("共通セットアップ完了:", { clientId, coach1Id, coach2Id, adminUserId });

const STANDARD = await getPlan("LIVE_WEEKLY1_3M");

const todayUtcDow = TODAY.getUTCDay();
const todayDateStr = TODAY.toISOString().slice(0, 10);
// approve_matching_request(コーチ承認)/admin_match_student_with_coachの24時間ルール比較用に、
// 「当日中に最初の回が来る」曜日パターンをTODAYのUTC曜日そのものにする。fn_generate_sessions_for_scheduleの
// cursor_date探索はCURRENT_DATE(DBのUTC暦日)基準のため、day_of_week=todayUtcDowなら
// diff=0で必ず「今日の日付」が最初の候補になる（既存seed.tsのsbDayOfWeekと同様、UTC基準で
// Postgres CURRENT_DATEと揃える前提）。start_timeはAsia/Tokyo解釈のため、今日の日付+任意の時刻は
// 「今日00:00 JST(=前日15:00 UTC)」〜「今日24:00 JST(=当日15:00 UTC)」の範囲に収まり、
// now+24hより必ず前になる（now+24hは常に翌日以降のUTC時刻のため）。
const t2t3DayOfWeek = todayUtcDow;
const t2t3StartTime = "10:00:00";
const t2t3EndTime = "10:30:00";
const expectedSkippedInstant = new Date(`${todayDateStr}T${t2t3StartTime.slice(0, 5)}:00+09:00`);

// T1/T4は今日と衝突しないよう別の曜日にする
const t1DayOfWeek = (todayUtcDow + 3) % 7;
const t4DayOfWeek = (todayUtcDow + 4) % 7;

const summary: Record<string, unknown> = { tag: TAG, clientId, coach1Id, coach2Id, expectedSkippedInstant: expectedSkippedInstant.toISOString() };

// ---------------------------------------------------------------------------
// 生徒T1: 予約リクエスト・振替候補・cancel_session 3-way・check_session_conflictの検証用
// ---------------------------------------------------------------------------
console.log("\n--- 生徒T1: 予約リクエスト/振替候補/cancel_session 3-way ---");
const t1Email = `${TAG}-24h-student-t1@gabby-qa-test.example`;
const t1Id = await ensureUser(t1Email, "1", `QA生徒T1（24h・権限・${TAG}）`, clientId);
const t1Start = addDays(TODAY, -30);
const t1End = addDays(TODAY, 335);
const { ticketId: t1TicketId } = await createContractLicenseTicket({ clientId, userId: t1Id, plan: STANDARD, startDate: t1Start, endDate: t1End, note: `QA自動テスト(${TAG}) 生徒T1` });
const t1Schedule = await matchViaAdmin(adminClient, { ticketId: t1TicketId, coachId: coach1Id, slotNo: 1, dayOfWeek: t1DayOfWeek, startTime: "09:00", endTime: "09:30" });

const t1Client: SupabaseClient = await signInAsRole(t1Email, PASSWORD);
// 予約リクエストのテスト(id1=承認, id2=却下, id3=取り下げ)用に、未割当枠を2つ作る
// (id1は承認で消費されるが、id2/id3は却下・取り下げのためチケットを消費せず使い回せる)
await freeUpOneShortfallSlot(t1Client, t1Schedule);
await freeUpOneShortfallSlot(t1Client, t1Schedule);
console.log("生徒T1投入完了(shortfall x2作成済み):", { t1TicketId, t1Schedule });

// ---------------------------------------------------------------------------
// 生徒T2: approve_matching_request(コーチ本人承認)の24時間ルール・スキップ検証用
// ---------------------------------------------------------------------------
console.log("\n--- 生徒T2: approve_matching_request 24時間ルール(当日分スキップ) ---");
const t2Email = `${TAG}-24h-student-t2@gabby-qa-test.example`;
const t2Id = await ensureUser(t2Email, "1", `QA生徒T2（マッチング24h・${TAG}）`, clientId);
const t2Start = addDays(TODAY, -30);
const t2End = addDays(TODAY, 335);
const { ticketId: t2TicketId } = await createContractLicenseTicket({ clientId, userId: t2Id, plan: STANDARD, startDate: t2Start, endDate: t2End, note: `QA自動テスト(${TAG}) 生徒T2` });

const t2Client: SupabaseClient = await signInAsRole(t2Email, PASSWORD);
const { data: t2Request, error: t2ReqErr } = await t2Client
  .from("com_t_matching_request")
  .insert({
    ticket_id: t2TicketId,
    student_id: t2Id,
    coach_id: coach1Id,
    slot_no: 1,
    requested_day_of_week: t2t3DayOfWeek,
    requested_start_time: t2t3StartTime,
    requested_end_time: t2t3EndTime,
  })
  .select("request_id")
  .single();
if (t2ReqErr) throw t2ReqErr;
await t2Client.auth.signOut();
console.log("生徒T2投入完了(保留中マッチングリクエスト):", { t2TicketId, t2RequestId: t2Request.request_id });

// ---------------------------------------------------------------------------
// 生徒T3: admin_match_student_with_coach(アドミンは24時間ルール対象外)の比較検証用
// ---------------------------------------------------------------------------
console.log("\n--- 生徒T3: admin_match_student_with_coach 24時間ルール対象外(当日分も即生成) ---");
const t3Email = `${TAG}-24h-student-t3@gabby-qa-test.example`;
const t3Id = await ensureUser(t3Email, "1", `QA生徒T3（マッチング24h対象外・${TAG}）`, clientId);
const t3Start = addDays(TODAY, -30);
const t3End = addDays(TODAY, 335);
const { ticketId: t3TicketId } = await createContractLicenseTicket({ clientId, userId: t3Id, plan: STANDARD, startDate: t3Start, endDate: t3End, note: `QA自動テスト(${TAG}) 生徒T3` });
console.log("生徒T3投入完了(未マッチング。verify.tsでadmin_match_student_with_coachを実行):", { t3TicketId });

// ---------------------------------------------------------------------------
// 生徒T4: admin_book_session_direct/release_lesson_schedule_slot/invalidate_user_licenseの
// アドミン専用チェック(コーチは拒否される)検証用
// ---------------------------------------------------------------------------
console.log("\n--- 生徒T4: アドミン専用RPCの権限チェック ---");
const t4Email = `${TAG}-24h-student-t4@gabby-qa-test.example`;
const t4Id = await ensureUser(t4Email, "1", `QA生徒T4（アドミン専用RPC・${TAG}）`, clientId);
const t4Start = addDays(TODAY, -30);
const t4End = addDays(TODAY, 335);
const { licenseId: t4LicenseId, ticketId: t4TicketId } = await createContractLicenseTicket({ clientId, userId: t4Id, plan: STANDARD, startDate: t4Start, endDate: t4End, note: `QA自動テスト(${TAG}) 生徒T4` });
const t4Schedule = await matchViaAdmin(adminClient, { ticketId: t4TicketId, coachId: coach1Id, slotNo: 1, dayOfWeek: t4DayOfWeek, startTime: "16:00", endTime: "16:30" });
console.log("生徒T4投入完了:", { t4TicketId, t4LicenseId, t4Schedule });

// ---------------------------------------------------------------------------
// サインアウト(投入したDBデータ自体は削除しない。verify.ts→cleanup.tsの順で後始末する)
// ---------------------------------------------------------------------------
await adminClient.auth.signOut();
await coach1Client.auth.signOut();
await t1Client.auth.signOut();

Object.assign(summary, {
  t1Id, t1TicketId, t1Schedule,
  t2Id, t2TicketId, t2RequestId: t2Request.request_id,
  t3Id, t3TicketId,
  t4Id, t4TicketId, t4LicenseId, t4Schedule,
  t2t3DayOfWeek, t2t3StartTime, t1DayOfWeek, t4DayOfWeek,
});

console.log(`\n=== 投入完了 ===`);
console.log(JSON.stringify(summary, null, 2));
console.log("\n次のステップ: session-24h-and-auth-refactor-verify.ts を同じ --env / --tag で実行してください。");
console.log("検証完了後、session-24h-and-auth-refactor-cleanup.ts を同じ --env / --tag で実行してテストデータを削除してください。");
