/**
 * マッチング成立時のチャットルーム自動開設・挨拶メッセージ（fn_send_matching_greeting）の検証。
 * コーチの承認（approve_matching_request）とアドミンの直接マッチング（admin_match_student_with_coach）を、
 * 実際にサインインした生徒・コーチ・アドミンのJWTで実行し、ルームの開設・再利用と文面の出し分けを確認する。
 *
 * シナリオ（1生徒=1シナリオ。いずれもタグ付きの使い捨てデータ）:
 *   - 生徒A（週2回）: コマ1をコーチが承認 → ルーム開設＋初回の文面 / コマ2を承認 → 同じルームに「別のコマ」の文面
 *   - 生徒B（週1回）: アドミンが手動開設したルームがある状態で直接マッチング → 既存ルームに初回の文面
 *   - 生徒C（週1回×2契約）: 1契約目を直接マッチング → 初回の文面 / 2契約目（更新）を直接マッチング → 「継続」の文面
 *   - 権限: 生徒は fn_ensure_one_on_one_chat_room / fn_send_matching_greeting を直接呼べない
 *
 * 検証後はタグで作成したデータを削除する（--keep 指定時は残す）。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260925-dev/matching-chat-greeting-verify.ts --env=dev --tag=mcg01
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
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;
const ADMIN_EMAIL = "qa-admin@gabby-qa-test.example";
const DUMMY_UUID = "00000000-0000-0000-0000-000000000000";
const TODAY = new Date();

const service = await createAdminClient(); // データ投入・結果の読み取り・後始末専用
const checks: CheckResult[] = [];
function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` … ${detail}` : ""}`);
}

console.log(`\n=== マッチング成立時のチャット自動開設の検証: env=${env} tag=${TAG} ===`);

await assertReleaseApplied(service, [
  { name: "fn_ensure_one_on_one_chat_room", dummyArgs: { p_user_a: DUMMY_UUID, p_user_b: DUMMY_UUID } },
  { name: "admin_match_student_with_coach", dummyArgs: { p_ticket_id: DUMMY_UUID, p_coach_id: DUMMY_UUID, p_slot_no: 1, p_day_of_week: 1, p_start_time: "10:00", p_end_time: "10:30" } },
]);

const TEXT_FIRST = "Thank you for choosing me as your Gabby Coach! See you in the first live Coaching session.";
const TEXT_ANOTHER_SLOT = "Thank you for choosing me for another weekly session! See you in the live Coaching session.";
const TEXT_CONTINUE = "Thank you for continuing your live Coaching sessions with me! See you in the next session.";

// ---------------------------------------------------------------------------
// データ投入
// ---------------------------------------------------------------------------
const clientName = `【QAテスト】マッチング時チャット自動開設検証（${TAG}）`;
const emails = {
  coach: `${TAG}-mcg-coach@gabby-qa-test.example`,
  a: `${TAG}-mcg-student-a@gabby-qa-test.example`,
  b: `${TAG}-mcg-student-b@gabby-qa-test.example`,
  c: `${TAG}-mcg-student-c@gabby-qa-test.example`,
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

async function ensureUser(email: string, userType: "1" | "2", userName: string, clientId: string): Promise<string> {
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

type Plan = { plan_id: string; plan_name: string; plan_name_en: string; contract_type: number; weekly_frequency: number | null; total_sessions: number | null; has_dialogue_practice: boolean };
async function getPlan(planCode: string): Promise<Plan> {
  const { data, error } = await service.from("com_m_contract_plan").select("*").eq("plan_code", planCode).single();
  if (error) throw error;
  return data as Plan;
}

async function createTicket(params: { clientId: string; userId: string; plan: Plan; startDate: Date; endDate: Date }): Promise<string> {
  const { data: contract, error: cErr } = await service
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
      note: `【QAテスト】${TAG}`,
    })
    .select("contract_id")
    .single();
  if (cErr) throw cErr;
  const { data: license, error: lErr } = await service
    .from("com_t_user_license")
    .insert({ contract_id: contract.contract_id, user_id: params.userId, status: 1, start_date: params.startDate.toISOString(), end_date: params.endDate.toISOString() })
    .select("license_id")
    .single();
  if (lErr) throw lErr;
  const { data: ticket, error: tErr } = await service
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

let clientId: string;
{
  const { data: existing } = await service.from("com_m_client").select("client_id").eq("client_name", clientName).maybeSingle();
  if (existing) throw new Error(`タグ ${TAG} のデータが残っています。別のタグで実行するか、先に後始末してください。`);
  const { data, error } = await service.from("com_m_client").insert({ client_name: clientName, client_type: 1, industry_type: 1 }).select("client_id").single();
  if (error) throw error;
  clientId = data.client_id as string;
}

const names = { coach: `QAテストコーチ（${TAG}）`, a: `QAテスト生徒A（${TAG}）`, b: `QAテスト生徒B（${TAG}）`, c: `QAテスト生徒C（${TAG}）` };
const coachId = await ensureUser(emails.coach, "2", names.coach, clientId);
const studentA = await ensureUser(emails.a, "1", names.a, clientId);
const studentB = await ensureUser(emails.b, "1", names.b, clientId);
const studentC = await ensureUser(emails.c, "1", names.c, clientId);
const userIds = [coachId, studentA, studentB, studentC];

try {
  const WEEKLY1 = await getPlan("LIVE_WEEKLY1_3M");
  const WEEKLY2 = await getPlan("LIVE_WEEKLY2_3M");
  const ticketA = await createTicket({ clientId, userId: studentA, plan: WEEKLY2, startDate: TODAY, endDate: addDays(TODAY, 90) });
  const ticketB = await createTicket({ clientId, userId: studentB, plan: WEEKLY1, startDate: TODAY, endDate: addDays(TODAY, 90) });
  // 1契約目（まもなく満了）と、その翌日から始まる2契約目（更新）
  const ticketC1 = await createTicket({ clientId, userId: studentC, plan: WEEKLY1, startDate: addDays(TODAY, -60), endDate: addDays(TODAY, 5) });
  const ticketC2 = await createTicket({ clientId, userId: studentC, plan: WEEKLY1, startDate: addDays(TODAY, 6), endDate: addDays(TODAY, 96) });

  // ---------------------------------------------------------------------------
  // 確認用ヘルパー
  // ---------------------------------------------------------------------------
  async function roomsBetween(x: string, y: string): Promise<string[]> {
    const { data, error } = await service.from("com_t_chat_room_user").select("room_id, user_id").in("user_id", [x, y]).is("left_at", null);
    if (error) throw error;
    const byRoom = new Map<string, Set<string>>();
    for (const r of data ?? []) byRoom.set(r.room_id, (byRoom.get(r.room_id) ?? new Set()).add(r.user_id));
    return [...byRoom].filter(([, members]) => members.size === 2).map(([roomId]) => roomId);
  }
  async function messagesOf(roomId: string): Promise<{ sender_user_id: string; message: string; message_type: string }[]> {
    const { data, error } = await service.from("com_t_chat").select("sender_user_id, message, message_type, created_at").eq("room_id", roomId).order("created_at");
    if (error) throw error;
    return data ?? [];
  }
  const expected = (name: string, body: string) => `Hi, ${name}! ${body}`;

  const coach = await signInAsRole(emails.coach, PASSWORD);
  const admin = await signInAsRole(ADMIN_EMAIL, PASSWORD);

  async function requestAndApprove(email: string, ticketId: string, studentId: string, slotNo: number, dayOfWeek: number): Promise<void> {
    const student = await signInAsRole(email, PASSWORD);
    const { data: req, error } = await student
      .from("com_t_matching_request")
      .insert({ ticket_id: ticketId, student_id: studentId, coach_id: coachId, slot_no: slotNo, requested_day_of_week: dayOfWeek, requested_start_time: "10:00:00", requested_end_time: "10:25:00" })
      .select("request_id")
      .single();
    await signOutRole(student);
    if (error) throw error;
    const { error: approveErr } = await coach.rpc("approve_matching_request", { p_request_id: req.request_id });
    if (approveErr) throw approveErr;
  }
  async function adminMatch(ticketId: string, dayOfWeek: number): Promise<void> {
    const { error } = await admin.rpc("admin_match_student_with_coach", {
      p_ticket_id: ticketId, p_coach_id: coachId, p_slot_no: 1, p_day_of_week: dayOfWeek, p_start_time: "10:00", p_end_time: "10:25",
    });
    if (error) throw error;
  }

  // --- 生徒A: コーチの承認（コマ1 → コマ2） ---------------------------------------
  await requestAndApprove(emails.a, ticketA, studentA, 1, 1);
  let rooms = await roomsBetween(studentA, coachId);
  record("A-1: コーチの承認で生徒A×コーチの1対1ルームが開設される", rooms.length === 1, `ルーム${rooms.length}件`);
  const roomA = rooms[0];
  let msgs = roomA ? await messagesOf(roomA) : [];
  record("A-1: コーチから初回の挨拶が1件送られる（生徒名入り）", msgs.length === 1 && msgs[0].sender_user_id === coachId && msgs[0].message === expected(names.a, TEXT_FIRST) && msgs[0].message_type === "TEXT", msgs[0]?.message);
  {
    const { data: members } = await service.from("com_t_chat_room_user").select("user_id, user_type").eq("room_id", roomA);
    const typeOf = new Map((members ?? []).map((m) => [m.user_id, m.user_type]));
    record("A-1: 参加者の種別はアドミンの手動開設と同じ値（生徒=1 / コーチ=2）", typeOf.get(studentA) === "1" && typeOf.get(coachId) === "2", JSON.stringify(Object.fromEntries(typeOf)));
    const { data: notice } = await service.from("com_t_notification").select("notification_id").eq("user_id", studentA).eq("notification_type", "CHAT_NEW_MESSAGE").eq("dedup_key", roomA);
    record("A-1: 生徒Aにチャット新着の通知が届く", (notice ?? []).length === 1);
    const student = await signInAsRole(emails.a, PASSWORD);
    const { data: visible } = await student.from("com_t_chat").select("chat_id").eq("room_id", roomA);
    await signOutRole(student);
    record("A-1: 生徒A本人のJWTで挨拶メッセージを閲覧できる", (visible ?? []).length === 1);
  }

  await requestAndApprove(emails.a, ticketA, studentA, 2, 2);
  rooms = await roomsBetween(studentA, coachId);
  msgs = roomA ? await messagesOf(roomA) : [];
  record("A-2: コマ2の承認では新しいルームを作らず同じルームを使う", rooms.length === 1 && rooms[0] === roomA, `ルーム${rooms.length}件`);
  record("A-2: 同じ契約の別のコマの文面が送られる", msgs.length === 2 && msgs[1].message === expected(names.a, TEXT_ANOTHER_SLOT), msgs[1]?.message);

  // --- 生徒B: アドミンが手動開設したルームがある状態で直接マッチング ------------------
  const { data: manual, error: manualErr } = await service.rpc("fn_ensure_one_on_one_chat_room", { p_user_a: coachId, p_user_b: studentB }).single<{ room_id: string; created: boolean }>();
  if (manualErr || !manual) throw manualErr ?? new Error("manual room not created");
  record("B-0: アドミンの手動開設（service_role）でルームが開設される", manual.created === true);
  await adminMatch(ticketB, 3);
  rooms = await roomsBetween(studentB, coachId);
  msgs = await messagesOf(manual.room_id);
  record("B-1: 直接マッチングでは手動開設済みのルームを使う", rooms.length === 1 && rooms[0] === manual.room_id, `ルーム${rooms.length}件`);
  record("B-1: 初めての担当なので初回の文面が送られる", msgs.length === 1 && msgs[0].message === expected(names.b, TEXT_FIRST), msgs[0]?.message);

  // --- 生徒C: 1契約目 → 2契約目（更新） -----------------------------------------------
  await adminMatch(ticketC1, 4);
  rooms = await roomsBetween(studentC, coachId);
  const roomC = rooms[0];
  msgs = roomC ? await messagesOf(roomC) : [];
  record("C-1: 1契約目の直接マッチングでルーム開設＋初回の文面", rooms.length === 1 && msgs.length === 1 && msgs[0].message === expected(names.c, TEXT_FIRST), msgs[0]?.message);
  await adminMatch(ticketC2, 5);
  rooms = await roomsBetween(studentC, coachId);
  msgs = roomC ? await messagesOf(roomC) : [];
  record("C-2: 更新後の契約の直接マッチングでは同じルームに「継続」の文面", rooms.length === 1 && msgs.length === 2 && msgs[1].message === expected(names.c, TEXT_CONTINUE), msgs[1]?.message);

  // --- 権限 ------------------------------------------------------------------------
  {
    const again = await service.rpc("fn_ensure_one_on_one_chat_room", { p_user_a: studentA, p_user_b: coachId }).single<{ room_id: string; created: boolean }>();
    record("アドミンの手動開設: 既存ルームがある2人には既存ルームを返す（created=false）", again.data?.room_id === roomA && again.data?.created === false);
    const student = await signInAsRole(emails.a, PASSWORD);
    const { error: ensureErr } = await student.rpc("fn_ensure_one_on_one_chat_room", { p_user_a: studentA, p_user_b: studentB });
    const { error: greetErr } = await student.rpc("fn_send_matching_greeting", { p_schedule_id: DUMMY_UUID });
    await signOutRole(student);
    record("生徒のJWTでは fn_ensure_one_on_one_chat_room を呼べない", Boolean(ensureErr), ensureErr?.code);
    record("生徒のJWTでは fn_send_matching_greeting を呼べない", Boolean(greetErr), greetErr?.code);
  }

  await signOutRole(coach);
  await signOutRole(admin);
} finally {
  if (KEEP) {
    console.log(`\n--keep 指定のためテストデータを残します（client: ${clientName}）`);
  } else {
    await cleanup();
  }
}

const log = writeResultLog({ scenario: "matching-chat-greeting", env, tag: TAG, checks });
console.log(`\n結果: ${log.passed}/${log.totalChecks} OK`);

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
  const { data: roomRows } = await service.from("com_t_chat_room_user").select("room_id").in("user_id", userIds);
  const roomIds = [...new Set((roomRows ?? []).map((r) => r.room_id as string))];
  if (roomIds.length > 0) await del("com_t_chat_room（メッセージ・参加者は連鎖削除）", () => service.from("com_t_chat_room").delete({ count: "exact" }).in("room_id", roomIds));
  const { data: tickets } = await service.from("com_t_user_session_ticket").select("ticket_id").in("user_id", userIds);
  const ticketIds = (tickets ?? []).map((t) => t.ticket_id as string);
  if (ticketIds.length > 0) await del("com_t_session", () => service.from("com_t_session").delete({ count: "exact" }).in("ticket_id", ticketIds));
  await del("com_t_user_license（チケット・担当枠・申請は連鎖削除）", () => service.from("com_t_user_license").delete({ count: "exact" }).in("user_id", userIds));
  await del("com_m_coach_student_relationship", () => service.from("com_m_coach_student_relationship").delete({ count: "exact" }).in("coach_id", userIds));
  await del("com_m_contract", () => service.from("com_m_contract").delete({ count: "exact" }).eq("client_id", clientId));
  await del("com_m_user（通知は連鎖削除）", () => service.from("com_m_user").delete({ count: "exact" }).in("id", userIds));
  for (const id of userIds) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) throw error;
  }
  console.log(`  削除 auth.users: ${userIds.length}件`);
  await del("com_m_client", () => service.from("com_m_client").delete({ count: "exact" }).eq("client_id", clientId));
}
