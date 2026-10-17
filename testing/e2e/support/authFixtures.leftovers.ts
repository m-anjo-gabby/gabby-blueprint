/**
 * 認証E2Eの残骸（失敗で後始末できなかった使い捨てユーザー・顧客）を確認・削除する。
 * 実行: pnpm exec tsx e2e/support/authFixtures.leftovers.ts [--env=staging] [--delete]（既定は dev）
 * 対象は authFixtures.ts が作る命名（メール `e2e<接頭辞><数字>-…`。接頭辞は createAuthFixture に渡す英小文字。顧客 `【QAテスト】認証E2E（…）`）に限る。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../helpers/env.ts";
import { createAdminClient } from "../../helpers/auth.ts";
import { deleteBusinessRecords } from "./authFixtures.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const doDelete = process.argv.includes("--delete");
const admin = await createAdminClient();
const PATTERN = /^(delivered\+)?e2e[a-z]+\d+-/;

const users: { id: string; email: string }[] = [];
for (let page = 1; page <= 20; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  users.push(...data.users.filter((u) => u.email && PATTERN.test(u.email)).map((u) => ({ id: u.id, email: u.email! })));
  if (data.users.length < 200) break;
}
const { data: clients } = await admin.from("com_m_client").select("client_id, client_name").like("client_name", "【QAテスト】認証E2E（%");
// 認証のアカウントだけが消えてユーザーの行が残った分（com_m_user は auth.users を参照しないため）も、顧客の所属から拾う
if ((clients ?? []).length > 0) {
  const { data: members } = await admin.from("com_m_user").select("id").in("client_id", (clients ?? []).map((c) => c.client_id));
  for (const m of members ?? []) if (!users.some((u) => u.id === m.id)) users.push({ id: m.id, email: "(認証のアカウントなし)" });
}
const { data: invitations } = await admin.from("com_t_invitation").select("email").like("email", "%e2e%");
const leftoverInvitations = (invitations ?? []).filter((i) => PATTERN.test(i.email));

console.log(`env=${env} users=${users.length} clients=${clients?.length ?? 0} invitations=${leftoverInvitations.length}`);
if (doDelete) {
  if (leftoverInvitations.length > 0) await admin.from("com_t_invitation").delete().in("email", leftoverInvitations.map((i) => i.email));
  // 契約・ライセンスはユーザーより先に消す（ライセンスが com_m_user を参照するため）
  for (const c of clients ?? []) {
    await admin.from("com_m_contents_access").delete().eq("client_id", c.client_id);
    const { data: contracts } = await admin.from("com_m_contract").select("contract_id").eq("client_id", c.client_id);
    const contractIds = (contracts ?? []).map((k) => k.contract_id as string);
    await deleteBusinessRecords(admin, { userIds: [], contractIds });
    if (contractIds.length > 0) await admin.from("com_m_contract").delete().in("contract_id", contractIds);
  }
  // 顧客の外の契約（固定テナント等）に付いたライセンス・セッション等も、ユーザーの側から消す
  await deleteBusinessRecords(admin, { userIds: users.map((u) => u.id), contractIds: [] });
  for (const u of users) {
    await admin.from("com_m_coach_student_relationship").delete().or(`student_id.eq.${u.id},coach_id.eq.${u.id}`);
    await admin.from("com_t_coach_rating").delete().or(`coach_id.eq.${u.id},student_id.eq.${u.id}`);
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
