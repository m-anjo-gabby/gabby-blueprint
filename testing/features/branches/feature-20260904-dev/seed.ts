/**
 * feature/20260904-dev のライブセッション データ主体テスト(②)を
 * dev/staging環境に再投入するスクリプト。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260904-dev/seed.ts --env=dev --tag=auto0910
 *
 * 既存の手動検証データ（顧客名「【QAテスト】ライブセッション検証」、
 * QA生徒1〜5等）とは --tag で完全に別名前空間にして衝突を避ける。
 * データは削除しない（比較のため残す）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { assertReleaseApplied } from "../../../helpers/preflight.ts";
import { latestPastDow, addDays, jstDateTimeISO, toDateOnlyString } from "../../../helpers/dates.ts";
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

console.log(`\n=== feature/20260904-dev ②シナリオ再投入: env=${env} tag=${TAG} ===`);

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------
await assertReleaseApplied(admin, [
  { name: "cancel_session", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000", p_reason: "x", p_proposed_slots: null, p_admin_refund_ticket: null } },
  { name: "reschedule_session", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000", p_new_date: "2026-01-01", p_new_start_time: "10:00:00", p_reason: "x" } },
  { name: "book_makeup_session", dummyArgs: { p_schedule_id: "00000000-0000-0000-0000-000000000000", p_new_date: "2026-01-01", p_new_start_time: "10:00:00" } },
  { name: "admin_match_student_with_coach", dummyArgs: { p_ticket_id: "00000000-0000-0000-0000-000000000000", p_coach_id: "00000000-0000-0000-0000-000000000000", p_slot_no: 1, p_day_of_week: 1, p_start_time: "10:00:00", p_end_time: "10:30:00" } },
  { name: "release_lesson_schedule_slot", dummyArgs: { p_schedule_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "resolve_stale_session", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000", p_resolved_status: 2, p_reason: "x" } },
]);
console.log("preflight OK: 対象RPCはすべて反映済み");

// ---------------------------------------------------------------------------
// 共通セットアップ: 顧客・コーチ・アドミン
// ---------------------------------------------------------------------------
async function ensureClient(name: string): Promise<string> {
  const { data: existing } = await admin.from("com_m_client").select("client_id").eq("client_name", name).maybeSingle();
  if (existing) return existing.client_id as string;
  const { data, error } = await admin
    .from("com_m_client")
    .insert({ client_name: name, client_type: 1, industry_type: 1 })
    .select("client_id")
    .single();
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
  const { error: updErr } = await admin
    .from("com_m_user")
    .update({ client_id: clientId, user_type: userType, user_name: userName })
    .eq("id", userId);
  if (updErr) throw updErr;
  return userId;
}

async function ensureCoachAvailability(coachId: string): Promise<void> {
  const { data: existing } = await admin.from("com_m_coach_availability").select("availability_id").eq("coach_id", coachId).limit(1);
  if (existing && existing.length > 0) return;
  const rows = Array.from({ length: 7 }, (_, dow) => ({
    coach_id: coachId,
    day_of_week: dow,
    start_time: "09:00:00",
    end_time: "19:00:00",
  }));
  const { error } = await admin.from("com_m_coach_availability").insert(rows);
  if (error) throw error;
}

const clientId = await ensureClient(`【QAテスト】ライブセッション検証（${TAG}）`);
const coachAId = await ensureUser(`${TAG}-coach-a@gabby-qa-test.example`, "2", `QAコーチA（${TAG}）`, clientId);
const coachBId = await ensureUser(`${TAG}-coach-b@gabby-qa-test.example`, "2", `QAコーチB（${TAG}）`, clientId);
await ensureCoachAvailability(coachAId);
await ensureCoachAvailability(coachBId);

// 代理操作用アドミンは既存の共通アカウントを再利用する（クライアントに紐づかないグローバル管理者）
const adminEmail = "qa-admin@gabby-qa-test.example";
let adminUserId = await findAuthUserByEmail(adminEmail);
if (!adminUserId) {
  adminUserId = await ensureUser(adminEmail, "0", "QAアドミン（代理操作用）", null);
} else {
  await admin.from("com_m_user").update({ user_type: "0" }).eq("id", adminUserId);
}

const adminClient: SupabaseClient = await signInAsRole(adminEmail, PASSWORD);
const coachAClient: SupabaseClient = await signInAsRole(`${TAG}-coach-a@gabby-qa-test.example`, PASSWORD);

console.log("共通セットアップ完了:", { clientId, coachAId, coachBId, adminUserId });

// ---------------------------------------------------------------------------
// プランマスタ取得
// ---------------------------------------------------------------------------
type Plan = {
  plan_id: string;
  plan_name: string;
  plan_name_en: string;
  contract_type: number;
  weekly_frequency: number | null;
  total_sessions: number | null;
  has_dialogue_practice: boolean;
};

async function getPlan(planCode: string): Promise<Plan> {
  const { data, error } = await admin.from("com_m_contract_plan").select("*").eq("plan_code", planCode).single();
  if (error) throw error;
  return data as Plan;
}

const WEEKLY1 = await getPlan("LIVE_WEEKLY1_3M");
const WEEKLY2 = await getPlan("LIVE_WEEKLY2_3M");

// ---------------------------------------------------------------------------
// 契約/ライセンス/チケット作成
// ---------------------------------------------------------------------------
async function createContractLicenseTicket(params: {
  userId: string;
  plan: Plan;
  startDate: Date;
  endDate: Date;
  note: string;
}) {
  const { data: contract, error: cErr } = await admin
    .from("com_m_contract")
    .insert({
      client_id: clientId,
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
    .insert({
      contract_id: contract.contract_id,
      user_id: params.userId,
      status: 1,
      start_date: params.startDate.toISOString(),
      end_date: params.endDate.toISOString(),
    })
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

// ---------------------------------------------------------------------------
// スケジュール/セッション 直接投入（過去分の実績を再現するため）
// ---------------------------------------------------------------------------
async function seedSchedule(params: {
  ticketId: string;
  studentId: string;
  coachId: string;
  slotNo: number;
  dayOfWeek: number;
  startDate: Date;
  endDate: Date;
}): Promise<string> {
  const { data, error } = await admin
    .from("com_m_lesson_schedule")
    .insert({
      ticket_id: params.ticketId,
      student_id: params.studentId,
      coach_id: params.coachId,
      slot_no: params.slotNo,
      day_of_week: params.dayOfWeek,
      start_time: "10:00:00",
      end_time: "10:30:00",
      coach_timezone: "Asia/Tokyo",
      status: 1,
      start_date: toDateOnlyString(params.startDate),
      end_date: toDateOnlyString(params.endDate),
    })
    .select("schedule_id")
    .single();
  if (error) throw error;
  return data.schedule_id as string;
}

async function seedSessionRow(params: {
  scheduleId: string;
  ticketId: string;
  studentId: string;
  coachId: string;
  date: Date;
}): Promise<string> {
  const { data, error } = await admin
    .from("com_t_session")
    .insert({
      schedule_id: params.scheduleId,
      ticket_id: params.ticketId,
      student_id: params.studentId,
      coach_id: params.coachId,
      start_datetime: jstDateTimeISO(params.date, 10, 0),
      end_datetime: jstDateTimeISO(params.date, 10, 30),
      status: 1,
    })
    .select("session_id")
    .single();
  if (error) throw error;
  return data.session_id as string;
}

async function resolveCompleted(client: SupabaseClient, sessionId: string, reason: string) {
  const { error } = await client.rpc("resolve_stale_session", { p_session_id: sessionId, p_resolved_status: 2, p_reason: reason });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// QA生徒1: 週1回契約(CoachA) 完了6/予定5/本人キャンセル1/代理キャンセル1/代理予約1
// ---------------------------------------------------------------------------
async function seedStudent1() {
  console.log("\n--- QA生徒1（週1回契約） ---");
  const studentId = await ensureUser(`${TAG}-student-1@gabby-qa-test.example`, "1", `QA生徒1（週1回契約・${TAG}）`, clientId);
  const studentClient = await signInAsRole(`${TAG}-student-1@gabby-qa-test.example`, PASSWORD);

  const dow = 1; // 月
  const pastCount = 6;
  const futureCount = 6;
  const lastPast = latestPastDow(TODAY, dow);
  const scheduleStart = addDays(lastPast, -(pastCount - 1) * 7);
  const contractStart = scheduleStart;
  const contractEnd = addDays(contractStart, 90);

  const { ticketId } = await createContractLicenseTicket({
    userId: studentId,
    plan: WEEKLY1,
    startDate: contractStart,
    endDate: contractEnd,
    note: `QA自動テスト(feature-20260904-dev, tag=${TAG})`,
  });
  const scheduleId = await seedSchedule({ ticketId, studentId, coachId: coachAId, slotNo: 1, dayOfWeek: dow, startDate: contractStart, endDate: contractEnd });

  const pastDates = Array.from({ length: pastCount }, (_, i) => addDays(scheduleStart, i * 7));
  const futureAnchor = addDays(lastPast, 14); // 今週分を飛ばし、確実に未来になる週から開始
  const futureDates = Array.from({ length: futureCount }, (_, i) => addDays(futureAnchor, i * 7));

  const pastSessionIds: string[] = [];
  for (const d of pastDates) pastSessionIds.push(await seedSessionRow({ scheduleId, ticketId, studentId, coachId: coachAId, date: d }));
  for (const id of pastSessionIds) await resolveCompleted(coachAClient, id, "QA自動テスト: 完了実績の再現");

  const futureSessionIds: string[] = [];
  for (const d of futureDates) futureSessionIds.push(await seedSessionRow({ scheduleId, ticketId, studentId, coachId: coachAId, date: d }));

  // 本人キャンセル(返還あり)
  {
    const { error } = await studentClient.rpc("cancel_session", {
      p_session_id: futureSessionIds[0],
      p_reason: "QA自動テスト: 生徒都合によるキャンセル",
      p_proposed_slots: null,
      p_admin_refund_ticket: null,
    });
    if (error) throw error;
  }
  // 代理キャンセル(返還なし)
  {
    const { error } = await adminClient.rpc("cancel_session", {
      p_session_id: futureSessionIds[1],
      p_reason: "QA自動テスト: アドミン代理キャンセル(返還なし)",
      p_proposed_slots: null,
      p_admin_refund_ticket: false,
    });
    if (error) throw error;
  }
  // 代理予約(振替枠を使った新規予約)
  {
    const makeupDate = addDays(futureDates[futureDates.length - 1], 7);
    const { error } = await adminClient.rpc("book_makeup_session", {
      p_schedule_id: scheduleId,
      p_new_date: toDateOnlyString(makeupDate),
      p_new_start_time: "10:00:00",
    });
    if (error) throw error;
  }

  console.log("QA生徒1 投入完了:", { studentId, ticketId, scheduleId, completed: pastSessionIds.length });
}

// ---------------------------------------------------------------------------
// QA生徒2: 週2回契約・コーチ分担、本人振替1・代理振替1・代理キャンセル(返還あり)1
// ---------------------------------------------------------------------------
async function seedStudent2() {
  console.log("\n--- QA生徒2（週2回・コーチ分担） ---");
  const studentId = await ensureUser(`${TAG}-student-2@gabby-qa-test.example`, "1", `QA生徒2（週2回・コーチ分担・${TAG}）`, clientId);
  const studentClient = await signInAsRole(`${TAG}-student-2@gabby-qa-test.example`, PASSWORD);

  const contractStart = TODAY;
  const contractEnd = addDays(TODAY, 90);
  const { ticketId } = await createContractLicenseTicket({
    userId: studentId,
    plan: WEEKLY2,
    startDate: contractStart,
    endDate: contractEnd,
    note: `QA自動テスト(feature-20260904-dev, tag=${TAG})`,
  });

  const { data: scheduleAId, error: e1 } = await adminClient.rpc("admin_match_student_with_coach", {
    p_ticket_id: ticketId,
    p_coach_id: coachAId,
    p_slot_no: 1,
    p_day_of_week: 2, // 火
    p_start_time: "10:00:00",
    p_end_time: "10:30:00",
  });
  if (e1) throw e1;
  const { data: scheduleBId, error: e2 } = await adminClient.rpc("admin_match_student_with_coach", {
    p_ticket_id: ticketId,
    p_coach_id: coachBId,
    p_slot_no: 2,
    p_day_of_week: 3, // 水
    p_start_time: "10:00:00",
    p_end_time: "10:30:00",
  });
  if (e2) throw e2;

  const { data: sessions, error: sErr } = await admin
    .from("com_t_session")
    .select("session_id, schedule_id, start_datetime")
    .in("schedule_id", [scheduleAId, scheduleBId])
    .order("start_datetime", { ascending: true });
  if (sErr) throw sErr;

  const coachASessions = sessions!.filter((s) => s.schedule_id === scheduleAId);
  const coachBSessions = sessions!.filter((s) => s.schedule_id === scheduleBId);

  // 生徒本人による振替(CoachAの1コマ目) -> 翌日15:00へ
  {
    const target = coachASessions[0];
    const newDate = addDays(new Date(target.start_datetime), 1);
    const { error } = await studentClient.rpc("reschedule_session", {
      p_session_id: target.session_id,
      p_new_date: toDateOnlyString(newDate),
      p_new_start_time: "15:00:00",
      p_reason: "QA自動テスト: 生徒本人による振替",
    });
    if (error) throw error;
  }
  // アドミン代理振替(CoachBの1コマ目) -> 翌日16:00へ
  {
    const target = coachBSessions[0];
    const newDate = addDays(new Date(target.start_datetime), 1);
    const { error } = await adminClient.rpc("reschedule_session", {
      p_session_id: target.session_id,
      p_new_date: toDateOnlyString(newDate),
      p_new_start_time: "16:00:00",
      p_reason: "QA自動テスト: アドミン代理振替",
    });
    if (error) throw error;
  }
  // アドミン代理キャンセル(返還あり)
  {
    const target = coachASessions[1];
    const { error } = await adminClient.rpc("cancel_session", {
      p_session_id: target.session_id,
      p_reason: "QA自動テスト: アドミン代理キャンセル(返還あり)",
      p_proposed_slots: null,
      p_admin_refund_ticket: true,
    });
    if (error) throw error;
  }

  console.log("QA生徒2 投入完了:", { studentId, ticketId, scheduleAId, scheduleBId });
}

// ---------------------------------------------------------------------------
// QA生徒3: CoachA完了8件 -> コーチ交代(交代キャンセル) -> CoachBへ直接マッチング
// ---------------------------------------------------------------------------
async function seedStudent3() {
  console.log("\n--- QA生徒3（コーチ交代） ---");
  const studentId = await ensureUser(`${TAG}-student-3@gabby-qa-test.example`, "1", `QA生徒3（コーチ交代・${TAG}）`, clientId);

  const dow = 4; // 木
  const pastCount = 8;
  const futureCount = 4;
  const lastPast = latestPastDow(TODAY, dow);
  const scheduleStart = addDays(lastPast, -(pastCount - 1) * 7);
  const contractStart = scheduleStart;
  const contractEnd = addDays(contractStart, 90);

  const { ticketId } = await createContractLicenseTicket({
    userId: studentId,
    plan: WEEKLY1,
    startDate: contractStart,
    endDate: contractEnd,
    note: `QA自動テスト(feature-20260904-dev, tag=${TAG})`,
  });
  const scheduleId = await seedSchedule({ ticketId, studentId, coachId: coachAId, slotNo: 1, dayOfWeek: dow, startDate: contractStart, endDate: contractEnd });

  const pastDates = Array.from({ length: pastCount }, (_, i) => addDays(scheduleStart, i * 7));
  const futureAnchor = addDays(lastPast, 14);
  const futureDates = Array.from({ length: futureCount }, (_, i) => addDays(futureAnchor, i * 7));

  const pastSessionIds: string[] = [];
  for (const d of pastDates) pastSessionIds.push(await seedSessionRow({ scheduleId, ticketId, studentId, coachId: coachAId, date: d }));
  for (const id of pastSessionIds) await resolveCompleted(coachAClient, id, "QA自動テスト: コーチ交代前の完了実績");

  for (const d of futureDates) await seedSessionRow({ scheduleId, ticketId, studentId, coachId: coachAId, date: d });

  // コーチ交代: 残りの未消化セッションを交代キャンセルにする
  {
    const { error } = await adminClient.rpc("release_lesson_schedule_slot", { p_schedule_id: scheduleId });
    if (error) throw error;
  }
  // CoachBへ直接マッチング(残り期間分の新規セッションが生成される)
  const { data: newScheduleId, error: matchErr } = await adminClient.rpc("admin_match_student_with_coach", {
    p_ticket_id: ticketId,
    p_coach_id: coachBId,
    p_slot_no: 1,
    p_day_of_week: 5, // 金
    p_start_time: "10:00:00",
    p_end_time: "10:30:00",
  });
  if (matchErr) throw matchErr;

  console.log("QA生徒3 投入完了:", { studentId, ticketId, oldScheduleId: scheduleId, newScheduleId, completed: pastSessionIds.length });
}

// ---------------------------------------------------------------------------
// QA生徒4: 契約データなし（空状態確認用）
// ---------------------------------------------------------------------------
async function seedStudent4() {
  console.log("\n--- QA生徒4（完全新規） ---");
  const studentId = await ensureUser(`${TAG}-student-4@gabby-qa-test.example`, "1", `QA生徒4（新規・契約なし・${TAG}）`, clientId);
  console.log("QA生徒4 投入完了:", { studentId, note: "契約データなし" });
}

// ---------------------------------------------------------------------------
// QA生徒5: 過去契約(満了・CoachA) + 現在契約(進行中・CoachB)
// ---------------------------------------------------------------------------
async function seedStudent5() {
  console.log("\n--- QA生徒5（過去契約あり） ---");
  const studentId = await ensureUser(`${TAG}-student-5@gabby-qa-test.example`, "1", `QA生徒5（過去契約あり・${TAG}）`, clientId);

  // 過去契約(満了・CoachA・土曜)
  const dow = 6; // 土
  const total = WEEKLY1.total_sessions!; // 12
  const pastContractEnd = addDays(TODAY, -30);
  const pastContractStart = addDays(pastContractEnd, -90);
  const lastOccurrence = latestPastDow(pastContractEnd, dow);
  const scheduleStart = addDays(lastOccurrence, -(total - 1) * 7);

  const { ticketId: pastTicketId } = await createContractLicenseTicket({
    userId: studentId,
    plan: WEEKLY1,
    startDate: pastContractStart,
    endDate: pastContractEnd,
    note: `QA自動テスト(feature-20260904-dev, tag=${TAG}) - 満了契約`,
  });
  const pastScheduleId = await seedSchedule({
    ticketId: pastTicketId,
    studentId,
    coachId: coachAId,
    slotNo: 1,
    dayOfWeek: dow,
    startDate: pastContractStart,
    endDate: pastContractEnd,
  });
  const pastDates = Array.from({ length: total }, (_, i) => addDays(scheduleStart, i * 7));
  const pastSessionIds: string[] = [];
  for (const d of pastDates) pastSessionIds.push(await seedSessionRow({ scheduleId: pastScheduleId, ticketId: pastTicketId, studentId, coachId: coachAId, date: d }));
  for (const id of pastSessionIds) await resolveCompleted(coachAClient, id, "QA自動テスト: 満了契約の消化実績");

  // 現在契約(進行中・CoachB・日曜)
  const currentStart = TODAY;
  const currentEnd = addDays(TODAY, 90);
  const { ticketId: currentTicketId } = await createContractLicenseTicket({
    userId: studentId,
    plan: WEEKLY1,
    startDate: currentStart,
    endDate: currentEnd,
    note: `QA自動テスト(feature-20260904-dev, tag=${TAG}) - 進行中契約`,
  });
  const { data: currentScheduleId, error } = await adminClient.rpc("admin_match_student_with_coach", {
    p_ticket_id: currentTicketId,
    p_coach_id: coachBId,
    p_slot_no: 1,
    p_day_of_week: 0, // 日
    p_start_time: "10:00:00",
    p_end_time: "10:30:00",
  });
  if (error) throw error;

  console.log("QA生徒5 投入完了:", { studentId, pastTicketId, pastScheduleId, currentTicketId, currentScheduleId, pastCompleted: pastSessionIds.length });
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------
const results: { name: string; ok: boolean; error?: string }[] = [];
for (const [name, fn] of [
  ["QA生徒1", seedStudent1],
  ["QA生徒2", seedStudent2],
  ["QA生徒3", seedStudent3],
  ["QA生徒4", seedStudent4],
  ["QA生徒5", seedStudent5],
] as const) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    console.error(`${name} 投入失敗:`, e);
    results.push({ name, ok: false, error: (e as Error).message });
  }
}

console.log("\n=== 投入結果サマリー ===");
console.table(results);

const failed = results.filter((r) => !r.ok);
process.exit(failed.length > 0 ? 1 : 0);
