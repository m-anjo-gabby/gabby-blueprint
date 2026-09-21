/**
 * session-lifecycle-refactor-seed.ts で投入したテストデータを削除する。
 * 本シナリオはユーザーから「テスト完了後に削除してよい」と明示的な指示があったため、
 * verify.ts実行後に本スクリプトを実行してテストデータを後始末する
 * (CLAUDE.md 6章の原則: 明示指示が無い限り残す、の例外運用)。
 *
 * 削除は一括DELETEではなく、本タグで作成した顧客(client_id)・コーチ・生徒6名の
 * IDに厳密に絞ったスコープで、FK依存順に1テーブルずつ行う(冪等: 対象が無ければ何もしない)。
 * 共有フィクスチャであるqa-admin@gabby-qa-test.exampleアカウントは削除しない。
 *
 * 削除順序（FK依存関係に基づく）:
 *   1. com_t_user_session_ticket_history (contract_id/user_idにFKあり、CASCADEなし)
 *   2. com_t_user_license (CASCADE: ticket→schedule→session→call_log/matching_requestまで連鎖)
 *   3. com_m_coach_student_relationship (coach_id/student_idにFKあり、CASCADEなし)
 *   4. com_m_contract (client_id経由でスコープ)
 *   5. com_m_user (CASCADE: com_t_notificationまで連鎖)
 *   6. auth.users (com_m_user削除後でないとFK制約で失敗する)
 *   7. com_m_client
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20260911-dev/session-lifecycle-refactor-cleanup.ts --env=dev --tag=lifecycle01
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";

const admin = await createAdminClient();

console.log(`\n=== セッションライフサイクル刷新 テストデータ削除: env=${env} tag=${TAG} ===`);

const clientName = `【QAテスト】セッションライフサイクル刷新検証（${TAG}）`;
const { data: client } = await admin.from("com_m_client").select("client_id").eq("client_name", clientName).maybeSingle();
if (!client) {
  console.log("対象クライアントが見つかりません。既に削除済みか、tagが一致していない可能性があります。何もせず終了します。");
  process.exit(0);
}
const clientId = client.client_id as string;

const emails = [
  `${TAG}-lifecycle-coach@gabby-qa-test.example`,
  `${TAG}-lifecycle-student-sa@gabby-qa-test.example`,
  `${TAG}-lifecycle-student-sb@gabby-qa-test.example`,
  `${TAG}-lifecycle-student-sc@gabby-qa-test.example`,
  `${TAG}-lifecycle-student-sd@gabby-qa-test.example`,
  `${TAG}-lifecycle-student-se@gabby-qa-test.example`,
  `${TAG}-lifecycle-student-sf@gabby-qa-test.example`,
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

// 1. チケット変更履歴（contract_id/user_idへのFKがCASCADE無しのため、契約・ユーザー削除前に消す）
{
  const { error, count } = await admin.from("com_t_user_session_ticket_history").delete({ count: "exact" }).in("user_id", userIds);
  if (error) throw error;
  console.log(`1. com_t_user_session_ticket_history削除: ${count ?? 0}件`);
}

// 2. セッション実体（com_t_session.ticket_idはcom_t_user_session_ticketへのFKにCASCADEが
//    無いため、ticket/licenseを消す前に明示的に削除する必要がある。schedule_id経由の
//    CASCADEに任せると「ticket_idからの直接参照がまだ残っている」としてFK違反になる）
{
  const { data: tickets, error: tErr } = await admin.from("com_t_user_session_ticket").select("ticket_id").in("user_id", userIds);
  if (tErr) throw tErr;
  const ticketIds = (tickets ?? []).map((t) => t.ticket_id as string);
  if (ticketIds.length > 0) {
    const { error, count } = await admin.from("com_t_session").delete({ count: "exact" }).in("ticket_id", ticketIds);
    if (error) throw error;
    console.log(`2. com_t_session削除(連鎖でcall_log/reschedule_proposalも削除): ${count ?? 0}件`);
  } else {
    console.log("2. com_t_session削除: 対象チケットなし(0件)");
  }
}

// 3. ライセンス（CASCADE: ticket→schedule→matching_requestまで連鎖。sessionは既に2で削除済み）
{
  const { error, count } = await admin.from("com_t_user_license").delete({ count: "exact" }).in("user_id", userIds);
  if (error) throw error;
  console.log(`3. com_t_user_license削除(連鎖でticket/scheduleも削除): ${count ?? 0}件`);
}

// 4. コーチ⇔生徒 担当関係マスタ（トリガー由来の派生データ。coach_id基準でこのタグ分のみ削除）
{
  const { error, count } = await admin.from("com_m_coach_student_relationship").delete({ count: "exact" }).in("coach_id", userIds);
  if (error) throw error;
  console.log(`4. com_m_coach_student_relationship削除: ${count ?? 0}件`);
}

// 5. 契約（client_id経由でこのタグ専用クライアントの契約のみに厳密スコープ）
{
  const { error, count } = await admin.from("com_m_contract").delete({ count: "exact" }).eq("client_id", clientId);
  if (error) throw error;
  console.log(`5. com_m_contract削除: ${count ?? 0}件`);
}

// 6. ユーザーマスタ（CASCADE: com_t_notificationも連鎖削除）
{
  const { error, count } = await admin.from("com_m_user").delete({ count: "exact" }).in("id", userIds);
  if (error) throw error;
  console.log(`6. com_m_user削除: ${count ?? 0}件`);
}

// 7. authユーザー本体（com_m_user削除後でないとFK制約で失敗する）
for (const userId of userIds) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
console.log(`7. auth.users削除: ${userIds.length}件`);

// 8. 顧客マスタ
{
  const { error } = await admin.from("com_m_client").delete().eq("client_id", clientId);
  if (error) throw error;
  console.log(`8. com_m_client削除: 1件`);
}

console.log(`\n=== 削除完了 (tag=${TAG}) ===`);
console.log("共有フィクスチャの qa-admin@gabby-qa-test.example アカウントは削除していません。");
