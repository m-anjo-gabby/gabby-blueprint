/**
 * 認証E2Eの残骸（失敗で後始末できなかった使い捨てユーザー・顧客）を確認・削除する。
 * 実行: pnpm exec tsx e2e/support/authFixtures.leftovers.ts [--delete]
 * 対象は authFixtures.ts が作る命名（メール `e2e(reset|invite|mail)<数字>-…`、顧客 `【QAテスト】認証E2E（…）`）に限る。
 */
import { loadTestEnv } from "../../helpers/env.ts";
import { createAdminClient } from "../../helpers/auth.ts";

loadTestEnv("dev");
const doDelete = process.argv.includes("--delete");
const admin = await createAdminClient();
const PATTERN = /^(delivered\+)?e2e(reset|invite|mail)\d+-/;

const users: { id: string; email: string }[] = [];
for (let page = 1; page <= 20; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  users.push(...data.users.filter((u) => u.email && PATTERN.test(u.email)).map((u) => ({ id: u.id, email: u.email! })));
  if (data.users.length < 200) break;
}
const { data: clients } = await admin.from("com_m_client").select("client_id, client_name").like("client_name", "【QAテスト】認証E2E（%");
const { data: invitations } = await admin.from("com_t_invitation").select("email").like("email", "e2e%");
const leftoverInvitations = (invitations ?? []).filter((i) => PATTERN.test(i.email));

console.log(`users=${users.length} clients=${clients?.length ?? 0} invitations=${leftoverInvitations.length}`);
if (doDelete) {
  if (leftoverInvitations.length > 0) await admin.from("com_t_invitation").delete().in("email", leftoverInvitations.map((i) => i.email));
  for (const u of users) {
    await admin.from("com_t_user_role").delete().eq("user_id", u.id);
    await admin.from("com_m_user").delete().eq("id", u.id);
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) console.warn(`user ${u.email}: ${error.message}`);
  }
  for (const c of clients ?? []) {
    const { error } = await admin.from("com_m_client").delete().eq("client_id", c.client_id);
    if (error) console.warn(`client ${c.client_name}: ${error.message}`);
  }
  console.log("deleted");
}
