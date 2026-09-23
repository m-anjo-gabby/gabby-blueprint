/**
 * license-management-overhaul-seed.ts で投入したテストデータを削除する。
 * 一括DELETEではなく、本タグで作成した顧客(client_id)・生徒2名のIDに厳密に絞ったスコープで、
 * FK依存順に1テーブルずつ行う(冪等: 対象が無ければ何もしない)。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20260918-dev/license-management-overhaul-cleanup.ts --env=dev --tag=licenseoverhaul01
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";

const admin = await createAdminClient();

console.log(`\n=== ライセンス管理見直し テストデータ削除: env=${env} tag=${TAG} ===`);

const clientName = `【QAテスト】ライセンス管理見直し検証（${TAG}）`;
const { data: client } = await admin.from("com_m_client").select("client_id").eq("client_name", clientName).maybeSingle();
if (!client) {
  console.log("対象クライアントが見つかりません。既に削除済みか、tagが一致していない可能性があります。何もせず終了します。");
  process.exit(0);
}
const clientId = client.client_id as string;

const emails = [`${TAG}-license-student-a@gabby-qa-test.example`, `${TAG}-license-student-b@gabby-qa-test.example`];

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

// 1. ライセンス変更履歴（license_idにはFK無しだがcontract_id/user_idにはFKがありCASCADE無し。
//    updateUserLicense/assignLicenseToUser等アプリ側のロジックを経由した検証を行った場合のみ
//    行が作られる。DB制約(EXCLUDE)の直接検証だけを行った場合は0件のまま）
{
  const { error, count } = await admin.from("com_t_user_license_history").delete({ count: "exact" }).in("user_id", userIds);
  if (error) throw error;
  console.log(`1. com_t_user_license_history削除: ${count ?? 0}件`);
}

// 2. ライセンス（com_t_user_license.contract_id/user_idはcom_m_contract/com_m_userへのFKにCASCADE無し）
{
  const { error, count } = await admin.from("com_t_user_license").delete({ count: "exact" }).in("user_id", userIds);
  if (error) throw error;
  console.log(`2. com_t_user_license削除: ${count ?? 0}件`);
}

// 3. 契約（client_id経由でこのタグ専用クライアントの契約のみに厳密スコープ）
{
  const { error, count } = await admin.from("com_m_contract").delete({ count: "exact" }).eq("client_id", clientId);
  if (error) throw error;
  console.log(`3. com_m_contract削除: ${count ?? 0}件`);
}

// 4. ユーザーマスタ
{
  const { error, count } = await admin.from("com_m_user").delete({ count: "exact" }).in("id", userIds);
  if (error) throw error;
  console.log(`4. com_m_user削除: ${count ?? 0}件`);
}

// 5. authユーザー本体（com_m_user削除後でないとFK制約で失敗する）
for (const userId of userIds) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
console.log(`5. auth.users削除: ${userIds.length}件`);

// 6. 顧客マスタ
{
  const { error } = await admin.from("com_m_client").delete().eq("client_id", clientId);
  if (error) throw error;
  console.log("6. com_m_client削除: 1件");
}

console.log(`\n=== 削除完了 (tag=${TAG}) ===`);
