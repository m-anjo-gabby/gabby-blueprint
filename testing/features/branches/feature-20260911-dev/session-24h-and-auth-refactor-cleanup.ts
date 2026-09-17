/**
 * session-24h-and-auth-refactor-seed.ts / -verify.ts で投入・生成したテストデータを削除する。
 * 本シナリオはユーザーから「テスト完了後に削除してよい」と明示的な指示があったため、
 * verify.ts実行後に本スクリプトを実行してテストデータを後始末する
 * (CLAUDE.md 6章の原則: 明示指示が無い限り残す、の例外運用)。
 *
 * 削除は一括DELETEではなく、本タグで作成した顧客(client_id)・コーチ2名・生徒4名の
 * IDに厳密に絞ったスコープで、FK依存順に1テーブルずつ行う(冪等: 対象が無ければ何もしない)。
 * 共有フィクスチャであるqa-admin@gabby-qa-test.exampleアカウントは削除しない。
 *
 * 削除順序（session-lifecycle-refactor-cleanup.tsをベースに、本シナリオ固有のFK
 * (com_t_session_slot_proposal.resulting_session_id、非CASCADE)への対応を追加）:
 *   1. com_t_user_session_ticket_history
 *   2. com_t_session_slot_proposal (resulting_session_idがcom_t_sessionへの非CASCADE FKの
 *      ため、com_t_sessionより先に削除する必要がある。KJ-2026-0915-01参照。統合後は
 *      振替候補・自由予約リクエスト両方がこのテーブルに含まれる)
 *   3. com_t_session (ticket_id経由で明示削除。CASCADEでcall_logも連鎖)
 *   4. com_t_user_license (CASCADE: ticket→schedule→matching_requestまで連鎖)
 *   5. com_m_coach_student_relationship
 *   6. com_m_contract
 *   7. com_m_user (CASCADE: com_t_notificationまで連鎖)
 *   8. auth.users
 *   9. com_m_client
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20260911-dev/session-24h-and-auth-refactor-cleanup.ts --env=dev --tag=authrefactor01
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";

const admin = await createAdminClient();

console.log(`\n=== 24時間ルール・権限共通化 テストデータ削除: env=${env} tag=${TAG} ===`);

const clientName = `【QAテスト】24時間ルール・権限共通化検証（${TAG}）`;
const { data: client } = await admin.from("com_m_client").select("client_id").eq("client_name", clientName).maybeSingle();
if (!client) {
  console.log("対象クライアントが見つかりません。既に削除済みか、tagが一致していない可能性があります。何もせず終了します。");
  process.exit(0);
}
const clientId = client.client_id as string;

const emails = [
  `${TAG}-24h-coach1@gabby-qa-test.example`,
  `${TAG}-24h-coach2@gabby-qa-test.example`,
  `${TAG}-24h-student-t1@gabby-qa-test.example`,
  `${TAG}-24h-student-t2@gabby-qa-test.example`,
  `${TAG}-24h-student-t3@gabby-qa-test.example`,
  `${TAG}-24h-student-t4@gabby-qa-test.example`,
];

async function findUserIdsByEmails(targetEmails: string[]): Promise<string[]> {
  const found: string[] = [];
  const remaining = new Set(targetEmails);
  for (let page = 1; page <= 20 && remaining.size > 0; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email && remaining.has(u.email)) {
        found.push(u.id);
        remaining.delete(u.email);
      }
    }
    if (data.users.length < 200) break;
  }
  return found;
}

const userIds = await findUserIdsByEmails(emails);
console.log(`対象クライアント特定: clientId=${clientId}, 対象ユーザー${userIds.length}/${emails.length}名`);

// 1. チケット変更履歴
{
  const { error, count } = await admin.from("com_t_user_session_ticket_history").delete({ count: "exact" }).in("user_id", userIds);
  if (error) throw error;
  console.log(`1. com_t_user_session_ticket_history削除: ${count ?? 0}件`);
}

// 2. 候補提案・予約リクエスト(com_t_session_slot_proposal)を先に削除する。
//    resulting_session_id が com_t_session への非CASCADE FKのため、com_t_sessionより
//    先に消さないと「update or delete on table "com_t_session" violates foreign key
//    constraint "com_t_session_slot_proposal_resulting_session_id_fkey"」で失敗する
//    (KJ-2026-0915-01。schedule_id/student_id/coach_id、振替候補のsource_session_idへの
//    FKはCASCADEだが、resulting_session_idだけ非CASCADEのため、com_t_session側からの
//    連鎖に任せられない)。
{
  const { error, count } = await admin.from("com_t_session_slot_proposal").delete({ count: "exact" }).in("student_id", userIds);
  if (error) throw error;
  console.log(`2. com_t_session_slot_proposal削除: ${count ?? 0}件`);
}

// 3. セッション実体（ticket_id経由の直接FKにCASCADEが無いため明示削除。KJ-2026-0914-02参照）
{
  const { data: tickets, error: tErr } = await admin.from("com_t_user_session_ticket").select("ticket_id").in("user_id", userIds);
  if (tErr) throw tErr;
  const ticketIds = (tickets ?? []).map((t) => t.ticket_id as string);
  if (ticketIds.length > 0) {
    const { error, count } = await admin.from("com_t_session").delete({ count: "exact" }).in("ticket_id", ticketIds);
    if (error) throw error;
    console.log(`3. com_t_session削除(連鎖でcall_logも削除): ${count ?? 0}件`);
  } else {
    console.log("3. com_t_session削除: 対象チケットなし(0件)");
  }
}

// 4. ライセンス（CASCADE: ticket→schedule→matching_requestまで連鎖。sessionは既に3で削除済み）
{
  const { error, count } = await admin.from("com_t_user_license").delete({ count: "exact" }).in("user_id", userIds);
  if (error) throw error;
  console.log(`4. com_t_user_license削除(連鎖でticket/schedule/matching_requestも削除): ${count ?? 0}件`);
}

// 5. コーチ⇔生徒 担当関係マスタ
{
  const { error, count } = await admin.from("com_m_coach_student_relationship").delete({ count: "exact" }).in("coach_id", userIds);
  if (error) throw error;
  console.log(`5. com_m_coach_student_relationship削除: ${count ?? 0}件`);
}

// 6. 契約（client_id経由でこのタグ専用クライアントの契約のみに厳密スコープ）
{
  const { error, count } = await admin.from("com_m_contract").delete({ count: "exact" }).eq("client_id", clientId);
  if (error) throw error;
  console.log(`6. com_m_contract削除: ${count ?? 0}件`);
}

// 7. ユーザーマスタ（CASCADE: com_t_notificationも連鎖削除）
{
  const { error, count } = await admin.from("com_m_user").delete({ count: "exact" }).in("id", userIds);
  if (error) throw error;
  console.log(`7. com_m_user削除: ${count ?? 0}件`);
}

// 8. authユーザー本体
for (const userId of userIds) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
console.log(`8. auth.users削除: ${userIds.length}件`);

// 9. 顧客マスタ
{
  const { error } = await admin.from("com_m_client").delete().eq("client_id", clientId);
  if (error) throw error;
  console.log(`9. com_m_client削除: 1件`);
}

console.log(`\n=== 削除完了 (tag=${TAG}) ===`);
console.log("共有フィクスチャの qa-admin@gabby-qa-test.example アカウントは削除していません。");
