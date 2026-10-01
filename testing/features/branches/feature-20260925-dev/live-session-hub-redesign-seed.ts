/**
 * 生徒ライブセッション・ホーム(/live-room)刷新の画面確認用データ投入スクリプト(②)。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20260925-dev/live-session-hub-redesign-seed.ts --env=dev --tag=hubredesign01
 *
 * 投入するデータ（1生徒=1シナリオ。いずれも使い捨てのタグデータ）:
 *   - 生徒HA（週1回）: 前回セッション=宿題チェックリストあり(2/3完了)、コーチ都合キャンセル+振替候補3件、
 *     生徒キャンセル1件（履歴のキャンセル表示切替）、終了済みの過去契約1件（契約切替）
 *   - 生徒HB（週2回）: コマ1のみマッチング済み・コマ2はコーチ未選択、前回セッション=宿題本文のみ（チェックリストなし）
 *   - 生徒HC（週1回）: 前回セッション=宿題未登録、今後の予定をすべて生徒キャンセル（次回なし・未予約あり・キャンセル多数）
 *
 * 過去の実施済みセッションは、生成済みの予定をservice_roleで過去日時へ移して完了扱いにする
 * （RPCでは過去日時のセッションを作れないため。宿題も初期データとして直接投入する）。
 * キャンセル・振替候補の提案は、実際にサインインした生徒/コーチのJWTでcancel_session RPCを呼ぶ。
 *
 * 後始末は live-session-hub-redesign-cleanup.ts を同じ --env / --tag で実行する。
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
const DUMMY_UUID = "00000000-0000-0000-0000-000000000000";

const admin = await createAdminClient();
const TODAY = new Date();

console.log(`\n=== ライブセッション・ホーム刷新 画面確認データ投入: env=${env} tag=${TAG} ===`);

await assertReleaseApplied(admin, [
  { name: "admin_match_student_with_coach", dummyArgs: { p_ticket_id: DUMMY_UUID, p_coach_id: DUMMY_UUID, p_slot_no: 1, p_day_of_week: 1, p_start_time: "10:00", p_end_time: "10:30" } },
  { name: "fn_schedule_shortfall", dummyArgs: { p_schedule_id: DUMMY_UUID } },
  { name: "cancel_session", dummyArgs: { p_session_id: DUMMY_UUID } },
]);
console.log("Preflight OK: 対象RPCはすべて反映済みです。");

// ---------------------------------------------------------------------------
// 共通ヘルパー（feature-20260918-dev/target-sessions-adjustment-seed.tsと同型）
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

  return { ticketId: ticket.ticket_id as string };
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

async function listScheduledSessions(scheduleId: string): Promise<{ session_id: string; start_datetime: string }[]> {
  const { data, error } = await admin
    .from("com_t_session")
    .select("session_id, start_datetime")
    .eq("schedule_id", scheduleId)
    .eq("status", 1)
    .order("start_datetime", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 生成済みの予定を過去日時へ移し、正常完了として記録する（前回セッションの再現用。初期データ投入） */
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

async function insertHomework(params: { sessionId: string; coachId: string; studentId: string; text: string; checklist?: { text: string; done: boolean }[] }): Promise<void> {
  const { data, error } = await admin
    .from("com_t_session_homework")
    .insert({ session_id: params.sessionId, coach_id: params.coachId, student_id: params.studentId, homework_text: params.text })
    .select("homework_id")
    .single();
  if (error) throw error;
  if (!params.checklist?.length) return;
  const { error: itemErr } = await admin.from("com_t_session_homework_checklist_item").insert(
    params.checklist.map((item, index) => ({
      homework_id: data.homework_id,
      item_no: index + 1,
      item_text: item.text,
      is_done: item.done,
      done_at: item.done ? new Date().toISOString() : null,
    }))
  );
  if (itemErr) throw itemErr;
}

async function cancelAs(client: SupabaseClient, sessionId: string, reason: string, proposedSlots?: { start_datetime: string; end_datetime: string }[]): Promise<void> {
  const { error } = await client.rpc("cancel_session", {
    p_session_id: sessionId,
    p_reason: reason,
    p_proposed_slots: proposedSlots ?? null,
  });
  if (error) throw error;
}

/** 今日からdays日後の指定UTC時刻に始まる25分枠 */
function slotAt(days: number, utcHour: number): { start_datetime: string; end_datetime: string } {
  const start = addDays(TODAY, days);
  start.setUTCHours(utcHour, 0, 0, 0);
  return { start_datetime: start.toISOString(), end_datetime: new Date(start.getTime() + 25 * 60 * 1000).toISOString() };
}

// ---------------------------------------------------------------------------
// 共通セットアップ
// ---------------------------------------------------------------------------
const clientId = await ensureClient(`【QAテスト】ライブセッション・ホーム刷新検証（${TAG}）`);
const coachEmail = `${TAG}-hub-coach@gabby-qa-test.example`;
const coachId = await ensureUser(coachEmail, "2", `QAコーチ（ホーム刷新・${TAG}）`, clientId);

const adminEmail = "qa-admin@gabby-qa-test.example";
const adminClient = await signInAsRole(adminEmail, PASSWORD);
const coachClient = await signInAsRole(coachEmail, PASSWORD);

const WEEKLY1 = await getPlan("LIVE_WEEKLY1_3M");
const WEEKLY2 = await getPlan("LIVE_WEEKLY2_3M");
const contractStart = addDays(TODAY, -14);
const contractEnd = addDays(TODAY, 76);

// コーチの既存予定と重ならないよう、生徒ごとに曜日・時刻をずらす（コーチのタイムゾーン基準）
const summary: Record<string, unknown> = { tag: TAG, clientId, coachEmail };

// ---------------------------------------------------------------------------
// 生徒HA: 振替候補・チェックリスト付き宿題・キャンセル履歴・過去契約
// ---------------------------------------------------------------------------
{
  const email = `${TAG}-hub-student-ha@gabby-qa-test.example`;
  const studentId = await ensureUser(email, "1", `QA生徒HA（振替候補・${TAG}）`, clientId);
  await createContractLicenseTicket({ clientId, userId: studentId, plan: WEEKLY1, startDate: addDays(TODAY, -200), endDate: addDays(TODAY, -110), note: `QA自動テスト(${TAG}) 生徒HA 過去契約` });
  const { ticketId } = await createContractLicenseTicket({ clientId, userId: studentId, plan: WEEKLY1, startDate: contractStart, endDate: contractEnd, note: `QA自動テスト(${TAG}) 生徒HA 現在の契約` });
  const scheduleId = await matchViaAdmin(adminClient, { ticketId, coachId, slotNo: 1, dayOfWeek: 2, startTime: "10:00", endTime: "10:25" });

  const sessions = await listScheduledSessions(scheduleId);
  await backdateAsCompleted(sessions[0].session_id, 5);
  await insertHomework({
    sessionId: sessions[0].session_id,
    coachId,
    studentId,
    text: "Review today's phrases and record yourself reading the dialogue.",
    checklist: [
      { text: "Review 10 phrases", done: true },
      { text: "Shadow the dialogue 3 times", done: true },
      { text: "Record and submit your reading", done: false },
    ],
  });

  // 2件目(次回の次)をコーチ都合でキャンセルし振替候補を3件提案、3件目を生徒がキャンセル
  await cancelAs(coachClient, sessions[2].session_id, "急用のため", [slotAt(3, 4), slotAt(4, 4), slotAt(5, 4)]);
  const studentClient = await signInAsRole(email, PASSWORD);
  await cancelAs(studentClient, sessions[3].session_id, "出張のため");
  await studentClient.auth.signOut();

  Object.assign(summary, { ha: { email, ticketId, scheduleId } });
  console.log("生徒HA投入完了");
}

// ---------------------------------------------------------------------------
// 生徒HB: 週2回のうちコマ2が未選択、宿題は本文のみ
// ---------------------------------------------------------------------------
{
  const email = `${TAG}-hub-student-hb@gabby-qa-test.example`;
  const studentId = await ensureUser(email, "1", `QA生徒HB（コーチ未選択・${TAG}）`, clientId);
  const { ticketId } = await createContractLicenseTicket({ clientId, userId: studentId, plan: WEEKLY2, startDate: contractStart, endDate: contractEnd, note: `QA自動テスト(${TAG}) 生徒HB 週2回・1コマのみ` });
  const scheduleId = await matchViaAdmin(adminClient, { ticketId, coachId, slotNo: 1, dayOfWeek: 3, startTime: "10:00", endTime: "10:25" });

  const sessions = await listScheduledSessions(scheduleId);
  await backdateAsCompleted(sessions[0].session_id, 4);
  await insertHomework({
    sessionId: sessions[0].session_id,
    coachId,
    studentId,
    text: "Write three sentences about your weekend using the past tense.\nWe will review them next time.",
  });

  Object.assign(summary, { hb: { email, ticketId, scheduleId } });
  console.log("生徒HB投入完了");
}

// ---------------------------------------------------------------------------
// 生徒HC: 宿題未登録、今後の予定をすべて生徒キャンセル（次回なし・未予約・キャンセル多数）
// ---------------------------------------------------------------------------
{
  const email = `${TAG}-hub-student-hc@gabby-qa-test.example`;
  const studentId = await ensureUser(email, "1", `QA生徒HC（予定なし・${TAG}）`, clientId);
  const { ticketId } = await createContractLicenseTicket({ clientId, userId: studentId, plan: WEEKLY1, startDate: contractStart, endDate: contractEnd, note: `QA自動テスト(${TAG}) 生徒HC 予定なし` });
  const scheduleId = await matchViaAdmin(adminClient, { ticketId, coachId, slotNo: 1, dayOfWeek: 4, startTime: "10:00", endTime: "10:25" });

  const sessions = await listScheduledSessions(scheduleId);
  await backdateAsCompleted(sessions[0].session_id, 3);
  const studentClient = await signInAsRole(email, PASSWORD);
  for (const session of sessions.slice(1)) {
    await cancelAs(studentClient, session.session_id, "予定が合わないため");
  }
  await studentClient.auth.signOut();

  Object.assign(summary, { hc: { email, ticketId, scheduleId, cancelled: sessions.length - 1 } });
  console.log("生徒HC投入完了");
}

await adminClient.auth.signOut();
await coachClient.auth.signOut();

console.log(`\n=== 投入完了 ===`);
console.log(JSON.stringify(summary, null, 2));
console.log("\n確認後、live-session-hub-redesign-cleanup.ts を同じ --env / --tag で実行してテストデータを削除してください。");
