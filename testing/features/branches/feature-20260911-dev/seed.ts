/**
 * feature/20260911-dev（個別セッション予約管理リニューアル）のデータ主体テスト(②)を
 * dev/staging環境に投入するスクリプト。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/seed.ts --env=dev --tag=auto0912
 *
 * 既存の他ブランチのテストデータ（feature-20260904-dev等）とは --tag と専用クライアント名で
 * 完全に別名前空間にして衝突を避ける。データは削除しない（比較・手動確認のため残す）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { assertReleaseApplied, assertRpcRemoved } from "../../../helpers/preflight.ts";
import { addDays, jstDateTimeISO, toDateOnlyString } from "../../../helpers/dates.ts";
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

console.log(`\n=== feature/20260911-dev ②シナリオ投入: env=${env} tag=${TAG} ===`);

// ---------------------------------------------------------------------------
// Preflight: 新規RPCの存在確認 + 旧RPCの削除確認
// ---------------------------------------------------------------------------
await assertReleaseApplied(admin, [
  {
    name: "check_session_conflict",
    dummyArgs: {
      p_coach_id: "00000000-0000-0000-0000-000000000000",
      p_student_id: "00000000-0000-0000-0000-000000000000",
      p_start_datetime: "2026-01-01T00:00:00Z",
      p_end_datetime: "2026-01-01T00:30:00Z",
      p_exclude_session_id: null,
    },
  },
  {
    name: "create_session_booking_request",
    dummyArgs: {
      p_schedule_id: "00000000-0000-0000-0000-000000000000",
      p_start_datetime: "2026-01-01T00:00:00Z",
      p_end_datetime: "2026-01-01T00:30:00Z",
      p_reason: null,
    },
  },
  { name: "approve_session_booking_request", dummyArgs: { p_request_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "reject_session_booking_request", dummyArgs: { p_request_id: "00000000-0000-0000-0000-000000000000", p_reason: null } },
  { name: "withdraw_session_booking_request", dummyArgs: { p_request_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "decline_session_reschedule_proposals", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000" } },
  {
    name: "admin_reschedule_session",
    dummyArgs: {
      p_session_id: "00000000-0000-0000-0000-000000000000",
      p_new_start_datetime: "2026-01-01T00:00:00Z",
      p_new_end_datetime: "2026-01-01T00:30:00Z",
      p_reason: null,
    },
  },
  {
    name: "admin_book_session_direct",
    dummyArgs: {
      p_schedule_id: "00000000-0000-0000-0000-000000000000",
      p_start_datetime: "2026-01-01T00:00:00Z",
      p_end_datetime: "2026-01-01T00:30:00Z",
      p_reason: null,
    },
  },
]);
console.log("preflight OK: 新規RPCはすべて反映済み");

await assertRpcRemoved(admin, [
  { name: "reschedule_session", dummyArgs: { p_session_id: "00000000-0000-0000-0000-000000000000", p_new_date: "2026-01-01", p_new_start_time: "10:00:00", p_reason: "x" } },
  { name: "book_makeup_session", dummyArgs: { p_schedule_id: "00000000-0000-0000-0000-000000000000", p_new_date: "2026-01-01", p_new_start_time: "10:00:00" } },
  { name: "decline_session_reschedule_proposal", dummyArgs: { p_proposal_id: "00000000-0000-0000-0000-000000000000" } },
]);
console.log("preflight OK: 旧RPCはすべて削除済み");

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

const clientId = await ensureClient(`【QAテスト】予約管理リニューアル検証（${TAG}）`);
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

// ---------------------------------------------------------------------------
// 契約/ライセンス/チケット作成
// ---------------------------------------------------------------------------
async function createContractLicenseTicket(params: { userId: string; plan: Plan; startDate: Date; endDate: Date; note: string }) {
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

/** 任意の未来日時(JST 10:00-10:30固定)にstatus=scheduledの行を直接投入する */
async function seedSessionRow(params: { scheduleId: string; ticketId: string; studentId: string; coachId: string; date: Date }): Promise<string> {
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

function slot(date: Date, hour: number, minute: number, durationMinutes = 30) {
  const start = jstDateTimeISO(date, hour, minute);
  const end = new Date(new Date(start).getTime() + durationMinutes * 60_000).toISOString();
  return { start_datetime: start, end_datetime: end };
}

async function getProposalsForSession(sessionId: string) {
  const { data, error } = await admin
    .from("com_t_session_reschedule_proposal")
    .select("*")
    .eq("session_id", sessionId)
    .order("proposed_start_datetime", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// QA生徒1: コーチキャンセル時の振替候補提案(コーチ→生徒)と24時間期限・自動失効
// ---------------------------------------------------------------------------
async function seedStudent1() {
  console.log("\n--- QA生徒1（コーチ提案の振替候補） ---");
  const studentId = await ensureUser(`${TAG}-student-1@gabby-qa-test.example`, "1", `QA生徒1（コーチ提案・${TAG}）`, clientId);
  const studentClient = await signInAsRole(`${TAG}-student-1@gabby-qa-test.example`, PASSWORD);

  const contractStart = TODAY;
  const contractEnd = addDays(TODAY, 90);
  const { ticketId } = await createContractLicenseTicket({
    userId: studentId,
    plan: WEEKLY1,
    startDate: contractStart,
    endDate: contractEnd,
    note: `QA自動テスト(feature-20260911-dev, tag=${TAG})`,
  });
  const scheduleId = await seedSchedule({ ticketId, studentId, coachId: coachAId, slotNo: 1, dayOfWeek: addDays(TODAY, 7).getUTCDay(), startDate: contractStart, endDate: contractEnd });
  const sessionId = await seedSessionRow({ scheduleId, ticketId, studentId, coachId: coachAId, date: addDays(TODAY, 7) });

  const candidateA = slot(addDays(TODAY, 10), 14, 0);
  const candidateB = slot(addDays(TODAY, 11), 15, 0);
  const proposedAt = new Date();
  {
    const { error } = await coachAClient.rpc("cancel_session", {
      p_session_id: sessionId,
      p_reason: "QA自動テスト: コーチキャンセル+振替候補提案",
      p_proposed_slots: [candidateA, candidateB],
      p_admin_refund_ticket: null,
    });
    if (error) throw error;
  }

  const proposals = await getProposalsForSession(sessionId);
  if (proposals.length !== 2) throw new Error(`候補が2件生成されていません(actual=${proposals.length})`);

  const acceptTarget = proposals[0];
  const { data: newSessionId, error: acceptErr } = await studentClient.rpc("accept_session_reschedule_proposal", { p_proposal_id: acceptTarget.proposal_id });
  if (acceptErr) throw acceptErr;

  console.log("QA生徒1 投入完了:", { studentId, ticketId, scheduleId, sessionId, proposedAt: proposedAt.toISOString(), acceptedProposalId: acceptTarget.proposal_id, newSessionId });
}

// ---------------------------------------------------------------------------
// QA生徒2: 生徒キャンセル時の振替候補提案(生徒→コーチ)、一括却下・承諾
// ---------------------------------------------------------------------------
async function seedStudent2() {
  console.log("\n--- QA生徒2（生徒提案の振替候補） ---");
  const studentId = await ensureUser(`${TAG}-student-2@gabby-qa-test.example`, "1", `QA生徒2（生徒提案・${TAG}）`, clientId);
  const studentClient = await signInAsRole(`${TAG}-student-2@gabby-qa-test.example`, PASSWORD);

  const contractStart = TODAY;
  const contractEnd = addDays(TODAY, 90);
  const { ticketId } = await createContractLicenseTicket({
    userId: studentId,
    plan: WEEKLY1,
    startDate: contractStart,
    endDate: contractEnd,
    note: `QA自動テスト(feature-20260911-dev, tag=${TAG})`,
  });
  const scheduleId = await seedSchedule({ ticketId, studentId, coachId: coachAId, slotNo: 1, dayOfWeek: addDays(TODAY, 8).getUTCDay(), startDate: contractStart, endDate: contractEnd });
  const sessionA = await seedSessionRow({ scheduleId, ticketId, studentId, coachId: coachAId, date: addDays(TODAY, 8) });
  const sessionB = await seedSessionRow({ scheduleId, ticketId, studentId, coachId: coachAId, date: addDays(TODAY, 15) });

  // sessionA: 生徒が候補2件を提案 -> コーチが一括却下
  {
    const { error } = await studentClient.rpc("cancel_session", {
      p_session_id: sessionA,
      p_reason: "QA自動テスト: 生徒キャンセル+振替候補提案(却下されるケース)",
      p_proposed_slots: [slot(addDays(TODAY, 20), 13, 0), slot(addDays(TODAY, 21), 13, 0)],
      p_admin_refund_ticket: null,
    });
    if (error) throw error;
  }
  const proposalsA = await getProposalsForSession(sessionA);
  if (proposalsA.length !== 2) throw new Error(`sessionAの候補が2件生成されていません(actual=${proposalsA.length})`);
  {
    const { error } = await coachAClient.rpc("decline_session_reschedule_proposals", { p_session_id: sessionA });
    if (error) throw error;
  }

  // sessionB: 生徒が候補1件を提案 -> コーチが承諾
  {
    const { error } = await studentClient.rpc("cancel_session", {
      p_session_id: sessionB,
      p_reason: "QA自動テスト: 生徒キャンセル+振替候補提案(承諾されるケース)",
      p_proposed_slots: [slot(addDays(TODAY, 22), 13, 0)],
      p_admin_refund_ticket: null,
    });
    if (error) throw error;
  }
  const proposalsB = await getProposalsForSession(sessionB);
  if (proposalsB.length !== 1) throw new Error(`sessionBの候補が1件生成されていません(actual=${proposalsB.length})`);
  const { data: newSessionId, error: acceptErr } = await coachAClient.rpc("accept_session_reschedule_proposal", { p_proposal_id: proposalsB[0].proposal_id });
  if (acceptErr) throw acceptErr;

  console.log("QA生徒2 投入完了:", { studentId, ticketId, scheduleId, sessionA, sessionB, declinedProposalIds: proposalsA.map((p) => p.proposal_id), acceptedProposalId: proposalsB[0].proposal_id, newSessionId });
}

// ---------------------------------------------------------------------------
// QA生徒3: 未消化セッションの自由日時予約リクエスト(承認/却下/取下げ)
// ---------------------------------------------------------------------------
async function seedStudent3() {
  console.log("\n--- QA生徒3（予約リクエスト） ---");
  const studentId = await ensureUser(`${TAG}-student-3@gabby-qa-test.example`, "1", `QA生徒3（予約リクエスト・${TAG}）`, clientId);
  const studentClient = await signInAsRole(`${TAG}-student-3@gabby-qa-test.example`, PASSWORD);

  const contractStart = TODAY;
  const contractEnd = addDays(TODAY, 90);
  const { ticketId } = await createContractLicenseTicket({
    userId: studentId,
    plan: WEEKLY1,
    startDate: contractStart,
    endDate: contractEnd,
    note: `QA自動テスト(feature-20260911-dev, tag=${TAG})`,
  });
  const scheduleId = await seedSchedule({ ticketId, studentId, coachId: coachAId, slotNo: 1, dayOfWeek: addDays(TODAY, 9).getUTCDay(), startDate: contractStart, endDate: contractEnd });
  const sessionId = await seedSessionRow({ scheduleId, ticketId, studentId, coachId: coachAId, date: addDays(TODAY, 9) });
  {
    const { error } = await coachAClient.rpc("cancel_session", {
      p_session_id: sessionId,
      p_reason: "QA自動テスト: 未消化枠を作るためのキャンセル",
      p_proposed_slots: null,
      p_admin_refund_ticket: null,
    });
    if (error) throw error;
  }

  // 承認されるリクエスト
  const req1Slot = slot(addDays(TODAY, 30), 16, 0);
  const { data: req1Id, error: req1Err } = await studentClient.rpc("create_session_booking_request", {
    p_schedule_id: scheduleId,
    p_start_datetime: req1Slot.start_datetime,
    p_end_datetime: req1Slot.end_datetime,
    p_reason: "QA自動テスト: 承認されるリクエスト",
  });
  if (req1Err) throw req1Err;
  const { data: approvedSessionId, error: approveErr } = await coachAClient.rpc("approve_session_booking_request", { p_request_id: req1Id });
  if (approveErr) throw approveErr;

  // 却下されるリクエスト
  const req2Slot = slot(addDays(TODAY, 31), 16, 0);
  const { data: req2Id, error: req2Err } = await studentClient.rpc("create_session_booking_request", {
    p_schedule_id: scheduleId,
    p_start_datetime: req2Slot.start_datetime,
    p_end_datetime: req2Slot.end_datetime,
    p_reason: "QA自動テスト: 却下されるリクエスト",
  });
  if (req2Err) throw req2Err;
  {
    const { error } = await coachAClient.rpc("reject_session_booking_request", { p_request_id: req2Id, p_reason: "QA自動テスト: この時間は対応不可" });
    if (error) throw error;
  }

  // 取り下げられるリクエスト
  const req3Slot = slot(addDays(TODAY, 32), 16, 0);
  const { data: req3Id, error: req3Err } = await studentClient.rpc("create_session_booking_request", {
    p_schedule_id: scheduleId,
    p_start_datetime: req3Slot.start_datetime,
    p_end_datetime: req3Slot.end_datetime,
    p_reason: "QA自動テスト: 取り下げられるリクエスト",
  });
  if (req3Err) throw req3Err;
  {
    const { error } = await studentClient.rpc("withdraw_session_booking_request", { p_request_id: req3Id });
    if (error) throw error;
  }

  console.log("QA生徒3 投入完了:", { studentId, ticketId, scheduleId, req1Id, approvedSessionId, req2Id, req3Id });
}

// ---------------------------------------------------------------------------
// QA生徒4: ダブルブッキング防止は有効な予約枠のみが対象（ホットフィックス回帰確認）
// ---------------------------------------------------------------------------
async function seedStudent4() {
  console.log("\n--- QA生徒4（ダブルブッキング防止・ホットフィックス回帰） ---");
  const studentId = await ensureUser(`${TAG}-student-4@gabby-qa-test.example`, "1", `QA生徒4（Wブッキング回帰・${TAG}）`, clientId);
  const studentClient = await signInAsRole(`${TAG}-student-4@gabby-qa-test.example`, PASSWORD);

  const contractStart = TODAY;
  const contractEnd = addDays(TODAY, 90);
  const { ticketId } = await createContractLicenseTicket({
    userId: studentId,
    plan: WEEKLY1,
    startDate: contractStart,
    endDate: contractEnd,
    note: `QA自動テスト(feature-20260911-dev, tag=${TAG})`,
  });
  const scheduleId = await seedSchedule({ ticketId, studentId, coachId: coachAId, slotNo: 1, dayOfWeek: addDays(TODAY, 12).getUTCDay(), startDate: contractStart, endDate: contractEnd });
  const targetDate = addDays(TODAY, 12);
  const sessionId = await seedSessionRow({ scheduleId, ticketId, studentId, coachId: coachAId, date: targetDate });
  const targetSlot = slot(targetDate, 10, 0); // seedSessionRowと同じ10:00-10:30

  // Step A: 有効な予定セッションと同一日時への新規リクエストは即座に失敗するはず
  // （成功してしまった場合はシナリオの前提が崩れているため、ここで即座にfail-fastする。
  //   verify.tsは別プロセスのためこの一時的な状態を検証できず、ここで検証を完結させる）
  {
    const { data, error } = await studentClient.rpc("create_session_booking_request", {
      p_schedule_id: scheduleId,
      p_start_datetime: targetSlot.start_datetime,
      p_end_datetime: targetSlot.end_datetime,
      p_reason: "QA自動テスト: 重複するはずのリクエスト",
    });
    if (!error || data !== null) {
      throw new Error(`有効な予定セッションとの重複が検出されませんでした(想定外に成功): data=${JSON.stringify(data)}`);
    }
    if (!error.message.includes("coach already has a session")) {
      throw new Error(`想定と異なるエラーで失敗しました: ${error.message}`);
    }
    console.log("Step A確認OK: 有効な予定セッションとの重複は引き続き防止される", { message: error.message });
  }

  // 対象セッションをキャンセル(有効な予約枠ではなくなる)
  {
    const { error } = await coachAClient.rpc("cancel_session", {
      p_session_id: sessionId,
      p_reason: "QA自動テスト: ホットフィックス回帰確認のためのキャンセル",
      p_proposed_slots: null,
      p_admin_refund_ticket: null,
    });
    if (error) throw error;
  }

  // Step B: キャンセル済みセッションと全く同じ日時なら、リクエスト作成は成功するはず
  const { data: req4Id, error: req4Err } = await studentClient.rpc("create_session_booking_request", {
    p_schedule_id: scheduleId,
    p_start_datetime: targetSlot.start_datetime,
    p_end_datetime: targetSlot.end_datetime,
    p_reason: "QA自動テスト: キャンセル済みと同一日時のリクエスト(ホットフィックス回帰)",
  });
  if (req4Err) throw req4Err;

  // Step C: 承認時にunique制約違反にならず成功するはず（20260912ホットフィックスの本丸）
  const { data: newSessionId, error: approveErr } = await coachAClient.rpc("approve_session_booking_request", { p_request_id: req4Id });
  if (approveErr) throw approveErr;

  console.log("QA生徒4 投入完了:", { studentId, ticketId, scheduleId, sessionId, req4Id, newSessionId });
}

// ---------------------------------------------------------------------------
// QA生徒5: アドミン代理操作（承認ステップなしの即時反映）
// ---------------------------------------------------------------------------
async function seedStudent5() {
  console.log("\n--- QA生徒5（アドミン代理操作） ---");
  const studentId = await ensureUser(`${TAG}-student-5@gabby-qa-test.example`, "1", `QA生徒5（アドミン代理・${TAG}）`, clientId);

  const contractStart = TODAY;
  const contractEnd = addDays(TODAY, 90);
  const { ticketId } = await createContractLicenseTicket({
    userId: studentId,
    plan: WEEKLY1,
    startDate: contractStart,
    endDate: contractEnd,
    note: `QA自動テスト(feature-20260911-dev, tag=${TAG})`,
  });
  const scheduleId = await seedSchedule({ ticketId, studentId, coachId: coachAId, slotNo: 1, dayOfWeek: addDays(TODAY, 13).getUTCDay(), startDate: contractStart, endDate: contractEnd });
  const sessionId = await seedSessionRow({ scheduleId, ticketId, studentId, coachId: coachAId, date: addDays(TODAY, 13) });

  const rescheduleSlot = slot(addDays(TODAY, 16), 11, 0);
  const { data: rescheduledSessionId, error: rescheduleErr } = await adminClient.rpc("admin_reschedule_session", {
    p_session_id: sessionId,
    p_new_start_datetime: rescheduleSlot.start_datetime,
    p_new_end_datetime: rescheduleSlot.end_datetime,
    p_reason: "QA自動テスト: アドミン代理の日時変更",
  });
  if (rescheduleErr) throw rescheduleErr;

  const directBookSlot = slot(addDays(TODAY, 40), 17, 0);
  const { data: directSessionId, error: directErr } = await adminClient.rpc("admin_book_session_direct", {
    p_schedule_id: scheduleId,
    p_start_datetime: directBookSlot.start_datetime,
    p_end_datetime: directBookSlot.end_datetime,
    p_reason: "QA自動テスト: アドミン代理の直接予約",
  });
  if (directErr) throw directErr;

  console.log("QA生徒5 投入完了:", { studentId, ticketId, scheduleId, sessionId, rescheduledSessionId, directSessionId });
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
