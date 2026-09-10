/**
 * seed.ts で投入したQA生徒1〜5のデータについて、
 * testing/features/branches/feature-20260904-dev/live-session-data-integrity.feature の
 * Then節に対応する整合性チェックを行う。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20260904-dev/verify.ts --env=dev --tag=auto0910
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";

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
  .eq("client_name", `【QAテスト】ライブセッション検証（${TAG}）`)
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

for (const student of students ?? []) {
  const tickets = await ticketsOf(student.id);
  const sessions = await sessionsOf(student.id);
  console.log(`\n[${student.user_name}] tickets=${tickets.length} sessions=${sessions.length}`);

  if (student.user_name?.includes("QA生徒1")) {
    const t = tickets[0];
    const completed = sessions.filter((s) => s.status === 2);
    const scheduled = sessions.filter((s) => s.status === 1);
    const selfCancel = sessions.filter((s) => s.status === 3);
    const adminCancel = sessions.filter((s) => s.status === 10);
    check("生徒1: 完了6件", completed.length === 6, `actual=${completed.length}`);
    check("生徒1: 予定5件", scheduled.length === 5, `actual=${scheduled.length}`);
    check("生徒1: 本人キャンセル1件・返還あり", selfCancel.length === 1 && selfCancel[0]?.ticket_refunded === true);
    check("生徒1: 代理キャンセル1件・返還なし", adminCancel.length === 1 && adminCancel[0]?.ticket_refunded === false);
    check("生徒1: used_sessionsが完了数と一致", t.used_sessions === completed.length, `used_sessions=${t.used_sessions}`);
  }

  if (student.user_name?.includes("QA生徒2")) {
    const t = tickets[0];
    const rescheduledOld = sessions.filter((s) => s.status === 5);
    const rescheduledNew = sessions.filter((s) => s.rescheduled_from !== null);
    const cancelledRefunded = sessions.filter((s) => s.status === 10 && s.ticket_refunded === true);
    check("生徒2: 振替元が2件rescheduled化", rescheduledOld.length === 2, `actual=${rescheduledOld.length}`);
    check("生徒2: 振替先セッションが2件存在", rescheduledNew.length === 2, `actual=${rescheduledNew.length}`);
    check("生徒2: 代理キャンセル(返還あり)1件", cancelledRefunded.length === 1, `actual=${cancelledRefunded.length}`);
    check("生徒2: used_sessionsは0のまま(未完了のみ)", t.used_sessions === 0, `used_sessions=${t.used_sessions}`);
  }

  if (student.user_name?.includes("QA生徒3")) {
    const t = tickets[0];
    const completed = sessions.filter((s) => s.status === 2);
    const handoffCancelled = sessions.filter((s) => s.status === 9);
    const scheduled = sessions.filter((s) => s.status === 1);
    check("生徒3: 完了8件", completed.length === 8, `actual=${completed.length}`);
    check("生徒3: 交代キャンセルが1件以上、ticket_refundedはNULL", handoffCancelled.length > 0 && handoffCancelled.every((s) => s.ticket_refunded === null), `actual=${handoffCancelled.length}`);
    check("生徒3: CoachBへの新規予定セッションが存在", scheduled.length > 0, `actual=${scheduled.length}`);
    check("生徒3: used_sessionsは完了数(8)のみ・交代キャンセルは算入されない", t.used_sessions === 8, `used_sessions=${t.used_sessions}`);
  }

  if (student.user_name?.includes("QA生徒4")) {
    check("生徒4: 契約なし", tickets.length === 0, `tickets=${tickets.length}`);
    check("生徒4: セッションなし", sessions.length === 0, `sessions=${sessions.length}`);
  }

  if (student.user_name?.includes("QA生徒5")) {
    check("生徒5: チケットが2件(過去+現在)", tickets.length === 2, `actual=${tickets.length}`);
    const pastTicket = tickets.find((t) => t.total_sessions === t.used_sessions);
    const currentTicket = tickets.find((t) => t.used_sessions === 0);
    check("生徒5: 過去契約はused_sessions=total_sessions(満了)", !!pastTicket, `tickets=${JSON.stringify(tickets.map((t) => ({ id: t.ticket_id, used: t.used_sessions, total: t.total_sessions })))}`);
    check("生徒5: 現在契約はused_sessions=0(独立管理)", !!currentTicket);
    if (pastTicket) {
      const pastSessions = sessions.filter((s) => s.ticket_id === pastTicket.ticket_id);
      check("生徒5: 過去契約のセッションは全てcompleted", pastSessions.every((s) => s.status === 2), `statuses=${pastSessions.map((s) => s.status).join(",")}`);
    }
  }
}

console.log("\n=== 検証結果 ===");
console.table(checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail ?? "" })));

const failed = checks.filter((c) => !c.ok);
if (failed.length > 0) {
  console.error(`\nNG: ${failed.length}件の不整合`);
  process.exit(1);
} else {
  console.log(`\nOK: 全${checks.length}件のチェックに合格`);
  process.exit(0);
}
