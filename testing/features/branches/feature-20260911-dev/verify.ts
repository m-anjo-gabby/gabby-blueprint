/**
 * seed.ts で投入したQA生徒1〜5のデータについて、
 * testing/features/branches/feature-20260911-dev/booking-management-renewal.feature の
 * Then節に対応する整合性チェックを行う。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20260911-dev/verify.ts --env=dev --tag=auto0912
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";
import { writeResultLog } from "../../../helpers/results.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const admin = await createAdminClient();

console.log(`\n=== 整合性検証: env=${env} tag=${TAG} ===`);

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

const { data: client } = await admin
  .from("com_m_client")
  .select("client_id")
  .eq("client_name", `【QAテスト】予約管理リニューアル検証（${TAG}）`)
  .single();
if (!client) throw new Error("対象クライアントが見つかりません。seed.tsを先に実行してください。");

const { data: students } = await admin
  .from("com_m_user")
  .select("id, user_name")
  .eq("client_id", client.client_id)
  .eq("user_type", "1")
  .order("user_name");

async function ticketsOf(studentId: string) {
  const { data } = await admin.from("com_t_user_session_ticket").select("*").eq("user_id", studentId);
  return data ?? [];
}
async function sessionsOf(studentId: string) {
  const { data } = await admin.from("com_t_session").select("*").eq("student_id", studentId).order("start_datetime");
  return data ?? [];
}
async function proposalsOf(studentId: string) {
  const { data } = await admin.from("com_t_session_slot_proposal").select("*").eq("student_id", studentId).not("source_session_id", "is", null).order("proposed_start_datetime");
  return data ?? [];
}
async function bookingRequestsOf(studentId: string) {
  const { data } = await admin.from("com_t_session_slot_proposal").select("*").eq("student_id", studentId).is("source_session_id", null).order("proposed_start_datetime");
  return data ?? [];
}
async function notificationsOf(userId: string, notificationType: string) {
  const { data } = await admin.from("com_t_notification").select("*").eq("user_id", userId).eq("notification_type", notificationType);
  return data ?? [];
}

const HOUR_MS = 60 * 60 * 1000;

for (const student of students ?? []) {
  const sessions = await sessionsOf(student.id);
  const proposals = await proposalsOf(student.id);
  const bookingRequests = await bookingRequestsOf(student.id);
  console.log(`\n[${student.user_name}] sessions=${sessions.length} proposals=${proposals.length} bookingRequests=${bookingRequests.length}`);

  if (student.user_name?.includes("QA生徒1")) {
    check("生徒1: 候補が2件生成されている", proposals.length === 2, `actual=${proposals.length}`);
    const accepted = proposals.filter((p) => p.status === 2);
    const declined = proposals.filter((p) => p.status === 3);
    check("生徒1: 1件がaccepted・1件がdeclined", accepted.length === 1 && declined.length === 1, `accepted=${accepted.length} declined=${declined.length}`);
    check("生徒1: proposed_by_role=2(コーチ提案)", proposals.every((p) => p.proposed_by_role === 2), `roles=${proposals.map((p) => p.proposed_by_role).join(",")}`);

    const expiryOk = proposals.every((p) => {
      const diffMs = new Date(p.expires_at).getTime() - new Date(p.insert_date).getTime();
      return Math.abs(diffMs - 24 * HOUR_MS) < 5 * 60 * 1000; // ±5分の許容誤差
    });
    check("生徒1: expires_atがinsert_dateから24時間後(±5分)", expiryOk, `diffs=${proposals.map((p) => (new Date(p.expires_at).getTime() - new Date(p.insert_date).getTime()) / HOUR_MS).join(",")}`);

    if (accepted[0]) {
      const newSession = sessions.find((s) => s.session_id === accepted[0].resulting_session_id);
      check("生徒1: 承諾した候補の日時でセッションが新規作成されている", !!newSession && newSession.status === 1, `resulting_session_id=${accepted[0].resulting_session_id}`);
      // proposalsOf()はcom_t_session_slot_proposalを列エイリアスなしで取得するため、
      // 実カラム名source_session_idを参照する(session_idというカラムは存在しない)。
      check("生徒1: 新規セッションのrescheduled_fromが元セッションを参照", newSession?.rescheduled_from === accepted[0].source_session_id);
    }
  }

  if (student.user_name?.includes("QA生徒2")) {
    check("生徒2: proposed_by_role=1(生徒提案)がすべて", proposals.every((p) => p.proposed_by_role === 1), `roles=${proposals.map((p) => p.proposed_by_role).join(",")}`);
    check("生徒2: 候補が合計3件(却下2件+承諾1件)", proposals.length === 3, `actual=${proposals.length}`);
    const declined = proposals.filter((p) => p.status === 3);
    const accepted = proposals.filter((p) => p.status === 2);
    check("生徒2: 却下2件・承諾1件", declined.length === 2 && accepted.length === 1, `declined=${declined.length} accepted=${accepted.length}`);

    if (accepted[0]) {
      const newSession = sessions.find((s) => s.session_id === accepted[0].resulting_session_id);
      check("生徒2: コーチが承諾した候補の日時でセッションが新規作成されている", !!newSession && newSession.status === 1, `resulting_session_id=${accepted[0].resulting_session_id}`);
      const approvedNotifications = await notificationsOf(student.id, "SESSION_BOOKING_APPROVED");
      const matched = approvedNotifications.some((n) => (n.payload as Record<string, unknown>)?.session_id === accepted[0].resulting_session_id);
      check("生徒2: SESSION_BOOKING_APPROVED通知が生徒へ届いている", matched, `notifications=${approvedNotifications.length}`);
    }
  }

  if (student.user_name?.includes("QA生徒3")) {
    check("生徒3: 予約リクエストが3件", bookingRequests.length === 3, `actual=${bookingRequests.length}`);
    const approved = bookingRequests.filter((r) => r.status === 2);
    const rejected = bookingRequests.filter((r) => r.status === 3);
    const withdrawn = bookingRequests.filter((r) => r.status === 4);
    check("生徒3: 承認1件・却下1件・取下げ1件", approved.length === 1 && rejected.length === 1 && withdrawn.length === 1, `approved=${approved.length} rejected=${rejected.length} withdrawn=${withdrawn.length}`);

    if (approved[0]) {
      const newSession = sessions.find((s) => s.session_id === approved[0].resulting_session_id);
      check(
        "生徒3: 承認されたリクエストの日時でセッションが作成されている",
        !!newSession && newSession.status === 1 && newSession.start_datetime === approved[0].proposed_start_datetime,
        `resulting_session_id=${approved[0].resulting_session_id}`
      );
    }
    check("生徒3: 却下されたリクエストにresulting_session_idが無い", rejected[0]?.resulting_session_id == null);
    check("生徒3: 却下されたリクエストにreject_reasonがある", !!rejected[0]?.reject_reason, `reject_reason=${rejected[0]?.reject_reason}`);

    const requestNotifications = await notificationsOf(student.id, "SESSION_BOOKING_REJECTED");
    check("生徒3: SESSION_BOOKING_REJECTED通知が生徒へ届いている", requestNotifications.length >= 1, `count=${requestNotifications.length}`);
  }

  if (student.user_name?.includes("QA生徒4")) {
    check("生徒4: 予約リクエストが1件(キャンセル済みと同一日時のもの)", bookingRequests.length === 1, `actual=${bookingRequests.length}`);
    const req = bookingRequests[0];
    check("生徒4: そのリクエストが承認済み", req?.status === 2, `status=${req?.status}`);

    // 旧ステータス値4(cancelled_by_coach)はステータス簡素化(2026-09-14)により廃止済み。
    // 現行はstatus=3(cancelled)+cancel_category=2(coach)の組で判定する。
    const cancelledSessions = sessions.filter((s) => s.status === 3 && s.cancel_category === 2);
    check("生徒4: 元セッションがcancelled(coach起因)になっている", cancelledSessions.length === 1, `actual=${cancelledSessions.length}`);

    if (req && cancelledSessions[0]) {
      check(
        "生徒4: 承認後の新規セッションが元セッションと同一schedule_id・同一start_datetimeで作成されている(ホットフィックス確認)",
        req.resulting_session_id != null,
        `resulting_session_id=${req.resulting_session_id}`
      );
      const newSession = sessions.find((s) => s.session_id === req.resulting_session_id);
      check(
        "生徒4: 新規セッションのschedule_id・start_datetimeがキャンセル済みセッションと一致",
        !!newSession && newSession.schedule_id === cancelledSessions[0].schedule_id && newSession.start_datetime === cancelledSessions[0].start_datetime && newSession.status === 1,
        `new=${JSON.stringify({ schedule_id: newSession?.schedule_id, start_datetime: newSession?.start_datetime, status: newSession?.status })} cancelled=${JSON.stringify({ schedule_id: cancelledSessions[0].schedule_id, start_datetime: cancelledSessions[0].start_datetime })}`
      );
    }
  }

  if (student.user_name?.includes("QA生徒5")) {
    // アドミンの日時変更は「キャンセル＋予約」の2操作に統一された(admin_reschedule_session廃止、2026-09-15)。
    // 旧statusの値5(rescheduled)は既に廃止済み(ステータス簡素化パッチ)のため、
    // 日時変更のためのキャンセルはcancel_category=3(admin)を持つcancelled(status=3)行として現れる。
    const cancelledByAdmin = sessions.filter((s) => s.status === 3 && s.cancel_category === 3);
    const scheduled = sessions.filter((s) => s.status === 1);
    check("生徒5: 日時変更のためキャンセルした元セッションがcancel_category=3(admin)になっている", cancelledByAdmin.length === 1, `actual=${cancelledByAdmin.length}`);
    check("生徒5: アドミン代理の再予約(キャンセル＋予約)・直接予約後のscheduledセッションが2件", scheduled.length === 2, `actual=${scheduled.length}`);
  }
}

console.log("\n=== 検証結果 ===");
console.table(checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail ?? "" })));

const log = writeResultLog({
  scenario: "features/branches/feature-20260911-dev/booking-management-renewal.feature",
  env,
  tag: TAG,
  checks,
});

if (!log.ok) {
  console.error(`\nNG: ${log.failed}件の不整合`);
  process.exit(1);
} else {
  console.log(`\nOK: 全${log.totalChecks}件のチェックに合格`);
}
