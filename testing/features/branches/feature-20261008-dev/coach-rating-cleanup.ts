/**
 * coach-rating-seed.ts で投入したテストデータを削除する（画面確認の後に実行する）。
 *
 * 削除は本タグで作成した顧客(client_id)・コーチ・生徒5名(RA〜RE)のIDに絞ったスコープで、FK依存順に行う
 * （冪等: 対象が無ければ何もしない。共有フィクスチャの qa-admin は削除しない）。
 *   0. com_t_coach_rating（coach_id/student_id/ticket_id のFKにCASCADEが無いため最初に削除する）
 *   1. com_t_session_slot_proposal / com_t_session（ticket削除前に明示的に削除する。KJ-2026-0914-02）
 *   2. com_t_user_license（CASCADE: ticket→schedule→matching_request）
 *   3. com_m_coach_student_relationship
 *   4. com_m_contract（client_id経由）
 *   5. com_m_user（CASCADE: coach_profile・coach_availability・coach_stats・通知・規約同意）
 *   6. auth.users
 *   7. com_m_client
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20261008-dev/coach-rating-cleanup.ts --env=dev --tag=rating1010
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";

const admin = await createAdminClient();

console.log(`\n=== コーチ評価 テストデータ削除: env=${env} tag=${TAG} ===`);

const clientName = `【QAテスト】コーチ評価検証（${TAG}）`;
const { data: client } = await admin.from("com_m_client").select("client_id").eq("client_name", clientName).maybeSingle();
if (!client) {
  console.log("対象クライアントが見つかりません。既に削除済みか、tagが一致していない可能性があります。何もせず終了します。");
  process.exit(0);
}
const clientId = client.client_id as string;

const emails = [
  `${TAG}-rating-coach@gabby-qa-test.example`,
  ...["ra", "rb", "rc", "rd", "re"].map((key) => `${TAG}-rating-student-${key}@gabby-qa-test.example`),
];

async function findUserIdsByEmails(targetEmails: string[]): Promise<string[]> {
  const found: string[] = [];
  const remaining = new Set(targetEmails);
  for (let page = 1; page <= 50 && remaining.size > 0; page++) {
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

async function deleteIn(table: string, column: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await admin.from(table).delete({ count: "exact" }).in(column, ids);
  if (error) throw error;
  return count ?? 0;
}

console.log(`0. com_t_coach_rating削除: ${(await deleteIn("com_t_coach_rating", "coach_id", userIds)) + (await deleteIn("com_t_coach_rating", "student_id", userIds))}件`);
console.log(`1. com_t_session_slot_proposal削除: ${await deleteIn("com_t_session_slot_proposal", "student_id", userIds)}件`);
{
  const { data: tickets, error } = await admin.from("com_t_user_session_ticket").select("ticket_id").in("user_id", userIds);
  if (error) throw error;
  console.log(`1. com_t_session削除: ${await deleteIn("com_t_session", "ticket_id", (tickets ?? []).map((t) => t.ticket_id as string))}件`);
}
console.log(`2. com_t_user_license削除(連鎖でticket/scheduleも削除): ${await deleteIn("com_t_user_license", "user_id", userIds)}件`);
console.log(`3. com_m_coach_student_relationship削除: ${await deleteIn("com_m_coach_student_relationship", "coach_id", userIds)}件`);
{
  const { error, count } = await admin.from("com_m_contract").delete({ count: "exact" }).eq("client_id", clientId);
  if (error) throw error;
  console.log(`4. com_m_contract削除: ${count ?? 0}件`);
}
console.log(`5. com_m_user削除: ${await deleteIn("com_m_user", "id", userIds)}件`);
for (const userId of userIds) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
console.log(`6. auth.users削除: ${userIds.length}件`);
{
  const { error } = await admin.from("com_m_client").delete().eq("client_id", clientId);
  if (error) throw error;
  console.log("7. com_m_client削除: 1件");
}

console.log(`\n=== 削除完了 (tag=${TAG}) ===`);
