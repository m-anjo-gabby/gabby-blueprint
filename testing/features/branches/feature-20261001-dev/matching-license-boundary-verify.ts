/**
 * マッチング承認で作られるセッションが、契約（ライセンス）の期間内に収まることの検証。
 * 予約範囲の開始日・終了日はライセンスの開始・終了日時を日付にした値（DBはUTC）で、各回の日付はコーチの現地日付として
 * 扱われるため、期間の境目で「契約開始の直前の回」「契約終了の直後の回」が作られ得た（fn_generate_sessions_for_schedule）。
 *
 * シナリオ（いずれもタグ付きの使い捨てデータ。コーチはニューヨーク）:
 *   - 生徒A（次の契約のみ。週1回）: 契約は水曜0:00 JST開始。火曜9:00（NY）で申請 → 承認
 *       → 火曜9:00 NY は水曜0:00 JST より前のため、開始日の週の回は作られず翌週からになる
 *   - 生徒B（次の契約のみ。週1回）: 契約は約3週間後の火曜23:59 JST終了。火曜20:00（NY）で申請 → 承認
 *       → 終了日の火曜20:00 NY は水曜 JST（契約終了後）のため作られない
 * 申請は生徒、承認はコーチの実サインインJWTで行う（approve_matching_request）。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20261001-dev/matching-license-boundary-verify.ts --env=dev --tag=mlb01
 *   検証後はタグで作成したデータを削除する（--keep 指定時は残す）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole, signOutRole } from "../../../helpers/auth.ts";
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
const COACH_TZ = "America/New_York";
const DAY_MS = 24 * 60 * 60 * 1000;

const service = await createAdminClient(); // データ投入・結果の読み取り・後始末専用
const checks: CheckResult[] = [];
function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` … ${detail}` : ""}`);
}

console.log(`\n=== マッチングの予約範囲（契約期間の境目）の検証: env=${env} tag=${TAG} ===`);

/** n週後以降で最初の指定曜日（JST）の 0:00 JST */
function jstMidnightOfNextDow(dow: number, minDaysAhead: number): Date {
  const base = new Date(Date.now() + minDaysAhead * DAY_MS + 9 * 60 * 60 * 1000); // JSTの暦日をUTCの暦日として扱う
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const diff = (dow - d.getUTCDay() + 7) % 7;
  return new Date(d.getTime() + diff * DAY_MS - 9 * 60 * 60 * 1000);
}
/** JSTの暦日の 23:59:59.999（ライセンスの終了日時と同じ形） */
function jstEndOfDay(jstMidnight: Date): Date {
  return new Date(jstMidnight.getTime() + DAY_MS - 1);
}
const fmtJst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ") + " JST";

// ---------------------------------------------------------------------------
// データ投入
// ---------------------------------------------------------------------------
const clientName = `【QAテスト】マッチング予約範囲検証（${TAG}）`;
const emails = {
  coach: `${TAG}-mlb-coach@gabby-qa-test.example`,
  a: `${TAG}-mlb-student-a@gabby-qa-test.example`,
  b: `${TAG}-mlb-student-b@gabby-qa-test.example`,
};

{
  const { data: existing } = await service.from("com_m_client").select("client_id").eq("client_name", clientName).maybeSingle();
  if (existing) throw new Error(`タグ ${TAG} のデータが残っています。別のタグで実行するか、先に後始末してください。`);
}
const { data: client, error: clientErr } = await service.from("com_m_client").insert({ client_name: clientName, client_type: 1, industry_type: 1 }).select("client_id").single();
if (clientErr) throw clientErr;
const clientId = client.client_id as string;

async function createUser(email: string, userType: "1" | "2", userName: string, timezone: string): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const { error: updErr } = await service.from("com_m_user").update({ client_id: clientId, user_type: userType, user_name: userName, timezone }).eq("id", data.user.id);
  if (updErr) throw updErr;
  return data.user.id;
}

const coachId = await createUser(emails.coach, "2", `QAテストコーチNY（${TAG}）`, COACH_TZ);
const studentA = await createUser(emails.a, "1", `QAテスト生徒A（${TAG}）`, "Asia/Tokyo");
const studentB = await createUser(emails.b, "1", `QAテスト生徒B（${TAG}）`, "Asia/Tokyo");
const userIds = [coachId, studentA, studentB];

async function createTicket(userId: string, start: Date, end: Date): Promise<string> {
  const { data: plan, error: planErr } = await service.from("com_m_contract_plan").select("*").eq("plan_code", "LIVE_WEEKLY1_3M").single();
  if (planErr) throw planErr;
  const { data: contract, error: cErr } = await service
    .from("com_m_contract")
    .insert({
      client_id: clientId, plan_id: plan.plan_id, plan_name: plan.plan_name, plan_name_en: plan.plan_name_en,
      contract_name: `${plan.plan_name} ${crypto.randomUUID().slice(0, 8)}`, max_licenses: 1,
      start_date: start.toISOString(), end_date: end.toISOString(), status: 1, contract_type: plan.contract_type,
      weekly_frequency: plan.weekly_frequency, total_sessions: plan.total_sessions, has_dialogue_practice: plan.has_dialogue_practice,
      note: `【QAテスト】${TAG}`,
    })
    .select("contract_id")
    .single();
  if (cErr) throw cErr;
  const { data: license, error: lErr } = await service
    .from("com_t_user_license")
    .insert({ contract_id: contract.contract_id, user_id: userId, status: 1, start_date: start.toISOString(), end_date: end.toISOString() })
    .select("license_id")
    .single();
  if (lErr) throw lErr;
  const { data: ticket, error: tErr } = await service
    .from("com_t_user_session_ticket")
    .insert({ license_id: license.license_id, contract_id: contract.contract_id, user_id: userId, weekly_frequency: plan.weekly_frequency, total_sessions: plan.total_sessions })
    .select("ticket_id")
    .single();
  if (tErr) throw tErr;
  return ticket.ticket_id as string;
}

const ticketIds: string[] = [];
try {
  // 生徒A: 2週間以上先の水曜 0:00 JST 開始（約3か月）
  const startA = jstMidnightOfNextDow(3, 14);
  const endA = jstEndOfDay(new Date(startA.getTime() + 90 * DAY_MS));
  const ticketA = await createTicket(studentA, startA, endA);
  // 生徒B: 2週間以上先の木曜 0:00 JST 開始、その約3週間後の火曜 23:59 JST 終了（12回に届かず、終了日で打ち切られる長さ）
  const startB = jstMidnightOfNextDow(4, 14);
  const endB = jstEndOfDay(new Date(startB.getTime() + 19 * DAY_MS)); // 木曜 + 19日 = 火曜
  const ticketB = await createTicket(studentB, startB, endB);
  ticketIds.push(ticketA, ticketB);

  const coach = await signInAsRole(emails.coach, PASSWORD);
  async function requestAndApprove(email: string, ticketId: string, studentId: string, dayOfWeek: number, start: string, end: string): Promise<void> {
    const student = await signInAsRole(email, PASSWORD);
    const { data: req, error } = await student
      .from("com_t_matching_request")
      .insert({ ticket_id: ticketId, student_id: studentId, coach_id: coachId, slot_no: 1, requested_day_of_week: dayOfWeek, requested_start_time: start, requested_end_time: end })
      .select("request_id")
      .single();
    await signOutRole(student);
    if (error) throw error;
    const { error: approveErr } = await coach.rpc("approve_matching_request", { p_request_id: req.request_id });
    if (approveErr) throw approveErr;
  }

  async function sessionsOf(ticketId: string): Promise<{ start_datetime: string; end_datetime: string }[]> {
    const { data, error } = await service.from("com_t_session").select("start_datetime, end_datetime").eq("ticket_id", ticketId).eq("status", 1).order("start_datetime");
    if (error) throw error;
    return data ?? [];
  }

  // --- 生徒A: 契約開始の直前の回 ---------------------------------------------------
  await requestAndApprove(emails.a, ticketA, studentA, 2, "09:00:00", "09:25:00");
  const sessionsA = await sessionsOf(ticketA);
  const beforeStart = sessionsA.filter((s) => new Date(s.start_datetime) < startA);
  record(
    "A: 契約開始（水曜0:00 JST）より前の回が作られない",
    beforeStart.length === 0,
    `契約開始 ${fmtJst(startA.toISOString())} / 初回 ${sessionsA[0] ? fmtJst(sessionsA[0].start_datetime) : "なし"} / 開始前の回 ${beforeStart.length}件`
  );
  record("A: 回数分（12回）が契約期間内に作られる", sessionsA.length === 12 && sessionsA.every((s) => new Date(s.end_datetime) <= endA), `${sessionsA.length}回`);

  // --- 生徒B: 契約終了の直後の回 ---------------------------------------------------
  await requestAndApprove(emails.b, ticketB, studentB, 2, "20:00:00", "20:25:00");
  const sessionsB = await sessionsOf(ticketB);
  const afterEnd = sessionsB.filter((s) => new Date(s.end_datetime) > endB);
  const last = sessionsB[sessionsB.length - 1];
  record(
    "B: 契約終了（火曜23:59 JST）より後の回が作られない",
    afterEnd.length === 0,
    `契約終了 ${fmtJst(endB.toISOString())} / 最終回 ${last ? fmtJst(last.start_datetime) : "なし"} / 終了後の回 ${afterEnd.length}件`
  );
  record("B: 契約期間内の回は作られる（1回以上）", sessionsB.length > 0, `${sessionsB.length}回`);

  await signOutRole(coach);
} finally {
  if (KEEP) {
    console.log(`\n--keep 指定のためデータを残しました（tag=${TAG}）`);
  } else {
    console.log("\n--- 後始末 ---");
    const del = async (label: string, fn: () => PromiseLike<{ error: unknown; count?: number | null }>) => {
      const { error, count } = await fn();
      console.log(`${error ? "NG" : "OK"} ${label}: ${count ?? "-"}件${error ? ` ${JSON.stringify(error)}` : ""}`);
    };
    const { data: rooms } = await service.from("com_t_chat_room_user").select("room_id").in("user_id", userIds);
    const roomIds = [...new Set((rooms ?? []).map((r) => r.room_id))];
    if (roomIds.length > 0) await del("com_t_chat_room（メッセージ・参加者は連鎖削除）", () => service.from("com_t_chat_room").delete({ count: "exact" }).in("room_id", roomIds));
    if (ticketIds.length > 0) await del("com_t_session", () => service.from("com_t_session").delete({ count: "exact" }).in("ticket_id", ticketIds));
    await del("com_t_user_license（チケット・担当枠・申請は連鎖削除）", () => service.from("com_t_user_license").delete({ count: "exact" }).in("user_id", userIds));
    await del("com_m_coach_student_relationship", () => service.from("com_m_coach_student_relationship").delete({ count: "exact" }).in("coach_id", userIds));
    await del("com_m_contract", () => service.from("com_m_contract").delete({ count: "exact" }).eq("client_id", clientId));
    await del("com_m_user（通知は連鎖削除）", () => service.from("com_m_user").delete({ count: "exact" }).in("id", userIds));
    for (const id of userIds) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) console.log(`NG auth.users ${id}: ${error.message}`);
    }
    await del("com_m_client", () => service.from("com_m_client").delete({ count: "exact" }).eq("client_id", clientId));
  }
}

writeResultLog({ scenario: "matching-license-boundary", env, tag: TAG, checks });
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n結果: ${checks.length - failed}/${checks.length} OK`);
process.exit(failed > 0 ? 1 : 0);
