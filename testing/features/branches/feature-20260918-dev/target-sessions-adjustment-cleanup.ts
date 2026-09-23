/**
 * target-sessions-adjustment-seed.ts で投入したテストデータを削除する。
 * CLAUDE.md 6章の原則（テスト完了後は原則削除）に基づき、verify.ts実行・問題なし確認後に
 * 本スクリプトを実行してテストデータを後始末する。
 *
 * 削除は一括DELETEではなく、本タグで作成した顧客(client_id)・コーチ・生徒3名の
 * IDに厳密に絞ったスコープで、FK依存順に1テーブルずつ行う(冪等: 対象が無ければ何もしない)。
 * 共有フィクスチャであるqa-admin@gabby-qa-test.exampleアカウントは削除しない。
 *
 * 削除順序（FK依存関係に基づく。session-lifecycle-refactor-cleanup.tsと同型）:
 *   1. com_t_session (ticket_idはcom_t_user_session_ticketへのFKにCASCADEが無いため、
 *      ticket/license削除前に明示的に削除する必要がある。KJ-2026-0914-02参照)
 *   2. com_t_user_license (CASCADE: ticket→schedule→matching_requestまで連鎖。sessionは1で削除済み)
 *   3. com_m_coach_student_relationship (coach_id/student_idにFKあり、CASCADEなし)
 *   4. com_m_contract (client_id経由でスコープ)
 *   5. com_m_user (CASCADE: com_t_notificationまで連鎖)
 *   6. auth.users (com_m_user削除後でないとFK制約で失敗する)
 *   7. com_m_client
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20260918-dev/target-sessions-adjustment-cleanup.ts --env=dev --tag=targetsessions01
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";

const admin = await createAdminClient();

console.log(`\n=== ライブセッション管理見直し(target_sessions個別調整) テストデータ削除: env=${env} tag=${TAG} ===`);

const clientName = `【QAテスト】ライブセッション管理見直し検証（${TAG}）`;
const { data: client } = await admin.from("com_m_client").select("client_id").eq("client_name", clientName).maybeSingle();
if (!client) {
  console.log("対象クライアントが見つかりません。既に削除済みか、tagが一致していない可能性があります。何もせず終了します。");
  process.exit(0);
}
const clientId = client.client_id as string;

const emails = [
  `${TAG}-tsadj-coach@gabby-qa-test.example`,
  `${TAG}-tsadj-student-ta@gabby-qa-test.example`,
  `${TAG}-tsadj-student-tb@gabby-qa-test.example`,
  `${TAG}-tsadj-student-tc@gabby-qa-test.example`,
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

// 1. セッション実体（com_t_session.ticket_idはcom_t_user_session_ticketへのFKにCASCADEが
//    無いため、ticket/licenseを消す前に明示的に削除する必要がある）
{
  const { data: tickets, error: tErr } = await admin.from("com_t_user_session_ticket").select("ticket_id").in("user_id", userIds);
  if (tErr) throw tErr;
  const ticketIds = (tickets ?? []).map((t) => t.ticket_id as string);
  if (ticketIds.length > 0) {
    const { error, count } = await admin.from("com_t_session").delete({ count: "exact" }).in("ticket_id", ticketIds);
    if (error) throw error;
    console.log(`1. com_t_session削除(連鎖でcall_log/slot_proposalも削除): ${count ?? 0}件`);
  } else {
    console.log("1. com_t_session削除: 対象チケットなし(0件)");
  }
}

// 2. ライセンス（CASCADE: ticket→schedule→matching_requestまで連鎖。sessionは既に1で削除済み）
{
  const { error, count } = await admin.from("com_t_user_license").delete({ count: "exact" }).in("user_id", userIds);
  if (error) throw error;
  console.log(`2. com_t_user_license削除(連鎖でticket/scheduleも削除): ${count ?? 0}件`);
}

// 3. コーチ⇔生徒 担当関係マスタ（トリガー由来の派生データ。coach_id基準でこのタグ分のみ削除）
{
  const { error, count } = await admin.from("com_m_coach_student_relationship").delete({ count: "exact" }).in("coach_id", userIds);
  if (error) throw error;
  console.log(`3. com_m_coach_student_relationship削除: ${count ?? 0}件`);
}

// 4. 契約（client_id経由でこのタグ専用クライアントの契約のみに厳密スコープ）
{
  const { error, count } = await admin.from("com_m_contract").delete({ count: "exact" }).eq("client_id", clientId);
  if (error) throw error;
  console.log(`4. com_m_contract削除: ${count ?? 0}件`);
}

// 5. ユーザーマスタ（CASCADE: com_t_notificationも連鎖削除）
{
  const { error, count } = await admin.from("com_m_user").delete({ count: "exact" }).in("id", userIds);
  if (error) throw error;
  console.log(`5. com_m_user削除: ${count ?? 0}件`);
}

// 6. authユーザー本体（com_m_user削除後でないとFK制約で失敗する）
for (const userId of userIds) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
console.log(`6. auth.users削除: ${userIds.length}件`);

// 7. 顧客マスタ
{
  const { error } = await admin.from("com_m_client").delete().eq("client_id", clientId);
  if (error) throw error;
  console.log(`7. com_m_client削除: 1件`);
}

console.log(`\n=== 削除完了 (tag=${TAG}) ===`);
console.log("共有フィクスチャの qa-admin@gabby-qa-test.example アカウントは削除していません。");
