/**
 * coach-no-show-resolution-seed.ts で投入したデータに対し、resolve_stale_session の
 * coach_no_show(p_resolution=4)分岐を、コーチ本人の実JWTで呼び出し(When)、
 * 「生徒が不利にならないか」を重点的に検証する(Then)。
 * あわせて、引数名変更(p_completion_result→p_resolution)後もnormal(1)解決が
 * 従来通り動作することを回帰確認する。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/coach-no-show-resolution-verify.ts --env=dev --tag=noshow01
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { writeResultLog } from "../../../helpers/results.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;

const admin = await createAdminClient();

console.log(`\n=== coach-no-show-resolution 検証: env=${env} tag=${TAG} ===`);

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK" : "NG"}: ${name}${detail ? ` (${detail})` : ""}`);
}

// ---------------------------------------------------------------------------
// seed.tsが投入したユーザー・スケジュール・セッションをclient_name/emailから再特定する
// ---------------------------------------------------------------------------
const { data: client } = await admin.from("com_m_client").select("client_id").eq("client_name", `【QAテスト】コーチ無断欠席解決検証（${TAG}）`).single();
if (!client) throw new Error("対象クライアントが見つかりません。coach-no-show-resolution-seed.tsを先に実行してください。");

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

const coachEmail = `${TAG}-noshow-coach@gabby-qa-test.example`;
const coachId = await findUserByEmail(coachEmail);
const otherCoachEmail = `${TAG}-noshow-other-coach@gabby-qa-test.example`;
const nsId = await findUserByEmail(`${TAG}-noshow-student-ns@gabby-qa-test.example`);
const nmId = await findUserByEmail(`${TAG}-noshow-student-nm@gabby-qa-test.example`);

const coachClient = await signInAsRole(coachEmail, PASSWORD);
const otherCoachClient = await signInAsRole(otherCoachEmail, PASSWORD);

console.log("対象ユーザー特定完了:", { coachId, otherCoachEmail, nsId, nmId });

type ScheduleRow = { schedule_id: string };
async function getSchedule(coachIdArg: string, studentIdArg: string): Promise<ScheduleRow> {
  const { data, error } = await admin.from("com_m_lesson_schedule").select("schedule_id").eq("coach_id", coachIdArg).eq("student_id", studentIdArg).eq("status", 1).single();
  if (error) throw error;
  return data as ScheduleRow;
}

/**
 * seed.tsが直接投入した「終了予定時刻を過ぎたままscheduledのセッション」を特定する。
 * admin_match_student_with_coachが同じscheduleに未来分のセッションも多数生成しているため、
 * status=1だけでは絞り込めず、end_datetime<NOWも条件に加える必要がある。
 */
async function getStaleSessionId(scheduleId: string): Promise<string> {
  const { data, error } = await admin
    .from("com_t_session")
    .select("session_id")
    .eq("schedule_id", scheduleId)
    .eq("status", 1)
    .lt("end_datetime", new Date().toISOString())
    .single();
  if (error) throw error;
  return data.session_id as string;
}

type ShortfallRow = { expected_sessions: number; actual_sessions: number; shortfall: number };
async function shortfallFor(scheduleId: string): Promise<ShortfallRow> {
  const { data, error } = await admin.rpc("fn_schedule_shortfall", { p_schedule_id: scheduleId }).single();
  if (error) throw error;
  return data as ShortfallRow;
}

async function usedSessionsFor(ticketId: string): Promise<number> {
  const { data, error } = await admin.from("com_t_user_session_ticket").select("used_sessions").eq("ticket_id", ticketId).single();
  if (error) throw error;
  return data.used_sessions as number;
}

async function ticketIdFor(studentId: string): Promise<string> {
  const { data, error } = await admin.from("com_t_user_session_ticket").select("ticket_id").eq("user_id", studentId).single();
  if (error) throw error;
  return data.ticket_id as string;
}

// ===========================================================================
// 1. 生徒NS: コーチ無断欠席(coach_no_show=4) — 生徒が不利にならないことの検証
// ===========================================================================
console.log("\n--- 1. 生徒NS: コーチ無断欠席(coach_no_show=4) ---");
const nsSchedule = await getSchedule(coachId, nsId);
const nsSessionId = await getStaleSessionId(nsSchedule.schedule_id);
const nsTicketId = await ticketIdFor(nsId);

const nsUsedBefore = await usedSessionsFor(nsTicketId);
const nsShortfallBefore = await shortfallFor(nsSchedule.schedule_id);
check("NS: 解決前のused_sessionsは0", nsUsedBefore === 0, `used_sessions=${nsUsedBefore}`);
check(
  "NS: 解決前はactual_sessions===expected_sessions(生成上限まで埋まっており空き枠が無い)。この前提が無いと後続の「shortfall+1」検証が意味を持たない",
  nsShortfallBefore.actual_sessions === nsShortfallBefore.expected_sessions && nsShortfallBefore.shortfall === 0,
  JSON.stringify(nsShortfallBefore)
);

// 権限チェック: 無関係コーチ(このセッションの担当ではない)が呼ぶと拒否されること
{
  const { error } = await otherCoachClient.rpc("resolve_stale_session", { p_session_id: nsSessionId, p_resolution: 4, p_reason: "無関係コーチによる不正操作テスト" });
  check("NS: 無関係コーチによるcoach_no_show解決は権限エラーで拒否される", !!error, error?.message);
}

// When: コーチ本人がcoach_no_show(4)で解決する
const nsReason = "テスト: 完全に失念し、生徒に何の連絡も無いままセッション時間を過ぎてしまった";
const { error: nsResolveErr } = await coachClient.rpc("resolve_stale_session", { p_session_id: nsSessionId, p_resolution: 4, p_reason: nsReason });
check("NS: コーチ本人によるcoach_no_show(4)解決が成功する", !nsResolveErr, nsResolveErr?.message);

const { data: nsRow, error: nsRowErr } = await admin.from("com_t_session").select("status, cancel_category, ticket_refunded, completion_result, cancel_reason, cancelled_by").eq("session_id", nsSessionId).single();
if (nsRowErr) throw nsRowErr;
check(
  "NS: status=cancelled(3)/cancel_category=coach(2)/ticket_refunded=true/completion_result=NULLになる(生徒都合のno_showには絶対にならない)",
  nsRow.status === 3 && nsRow.cancel_category === 2 && nsRow.ticket_refunded === true && nsRow.completion_result === null,
  JSON.stringify(nsRow)
);
check("NS: cancelled_byがコーチ自身のIDになる", nsRow.cancelled_by === coachId, `cancelled_by=${nsRow.cancelled_by}`);
check("NS: cancel_reasonに入力した理由がそのまま記録される", nsRow.cancel_reason === nsReason, nsRow.cancel_reason ?? "null");

const nsUsedAfter = await usedSessionsFor(nsTicketId);
check("NS: used_sessionsが解決前後で変化しない(生徒のチケットが消費されない)", nsUsedAfter === nsUsedBefore, `before=${nsUsedBefore}, after=${nsUsedAfter}`);

const nsShortfallAfter = await shortfallFor(nsSchedule.schedule_id);
check(
  "NS: fn_schedule_shortfallがactual_sessions -1 / shortfall +1になる(未割当に戻り再予約可能になる)",
  nsShortfallAfter.actual_sessions === nsShortfallBefore.actual_sessions - 1 && nsShortfallAfter.shortfall === nsShortfallBefore.shortfall + 1,
  `before=${JSON.stringify(nsShortfallBefore)}, after=${JSON.stringify(nsShortfallAfter)}`
);

const { data: nsNotifications, error: nsNotifErr } = await admin
  .from("com_t_notification")
  .select("payload, link_path")
  .eq("user_id", nsId)
  .eq("notification_type", "SESSION_CANCELLED_BY_COACH")
  .order("occurred_at", { ascending: false })
  .limit(1);
if (nsNotifErr) throw nsNotifErr;
const nsNotification = nsNotifications?.[0];
check("NS: 生徒宛にSESSION_CANCELLED_BY_COACHの通知が作成される", !!nsNotification, JSON.stringify(nsNotification));
check(
  "NS: 通知payloadのcoach_nameがコーチ名になっている(生徒が誰の欠席か分かる)",
  nsNotification?.payload?.coach_name === `QAコーチ（無断欠席解決・${TAG}）`,
  JSON.stringify(nsNotification?.payload)
);

// ===========================================================================
// 2. 生徒NM: 引数名変更(p_resolution)後もnormal(1)解決が従来通り動くことの回帰確認
// ===========================================================================
console.log("\n--- 2. 生徒NM: normal解決(p_resolution=1)の回帰確認 ---");
const nmSchedule = await getSchedule(coachId, nmId);
const nmSessionId = await getStaleSessionId(nmSchedule.schedule_id);
const nmTicketId = await ticketIdFor(nmId);
const nmUsedBefore = await usedSessionsFor(nmTicketId);

const { error: nmResolveErr } = await coachClient.rpc("resolve_stale_session", { p_session_id: nmSessionId, p_resolution: 1, p_reason: "テスト: 直接Zoomで実施済み" });
check("NM: コーチ本人によるnormal(1)解決が新引数名(p_resolution)でも成功する", !nmResolveErr, nmResolveErr?.message);

const { data: nmRow, error: nmRowErr } = await admin.from("com_t_session").select("status, completion_result").eq("session_id", nmSessionId).single();
if (nmRowErr) throw nmRowErr;
check("NM: status=completed(2)/completion_result=normal(1)になる", nmRow.status === 2 && nmRow.completion_result === 1, JSON.stringify(nmRow));

const nmUsedAfter = await usedSessionsFor(nmTicketId);
check("NM: normal解決はused_sessionsが1増える(通常完了はチケットを消費する既存仕様が引数名変更後も変わっていない)", nmUsedAfter === nmUsedBefore + 1, `before=${nmUsedBefore}, after=${nmUsedAfter}`);

// ---------------------------------------------------------------------------
await coachClient.auth.signOut();
await otherCoachClient.auth.signOut();

const result = writeResultLog({ scenario: "coach-no-show-resolution.feature", env, tag: TAG, checks });
console.log(`\n=== 検証完了: ${result.passed}/${result.totalChecks} OK ===`);
if (!result.ok) {
  console.log("NGがあります。coach-no-show-resolution-cleanup.tsは実行せず、原因を確認してください。");
  process.exit(1);
}
