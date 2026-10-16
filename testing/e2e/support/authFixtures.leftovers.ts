/**
 * 認証E2Eの残骸（失敗で後始末できなかった使い捨てユーザー・顧客）を確認・削除する。
 * 実行: pnpm exec tsx e2e/support/authFixtures.leftovers.ts [--env=staging] [--delete]（既定は dev）
 * 対象は authFixtures.ts が作る命名（メール `e2e<接頭辞><数字>-…`。接頭辞は createAuthFixture に渡す英小文字。顧客 `【QAテスト】認証E2E（…）`）に限る。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../helpers/env.ts";
import { createAdminClient } from "../../helpers/auth.ts";

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
const { data: invitations } = await admin.from("com_t_invitation").select("email").like("email", "%e2e%");
const leftoverInvitations = (invitations ?? []).filter((i) => PATTERN.test(i.email));

console.log(`env=${env} users=${users.length} clients=${clients?.length ?? 0} invitations=${leftoverInvitations.length}`);
if (doDelete) {
  if (leftoverInvitations.length > 0) await admin.from("com_t_invitation").delete().in("email", leftoverInvitations.map((i) => i.email));
  // 契約・ライセンスはユーザーより先に消す（ライセンスが com_m_user を参照するため）
  for (const c of clients ?? []) {
    await admin.from("com_m_contents_access").delete().eq("client_id", c.client_id);
    const { data: contracts } = await admin.from("com_m_contract").select("contract_id").eq("client_id", c.client_id);
    const contractIds = (contracts ?? []).map((k) => k.contract_id);
    if (contractIds.length > 0) {
      const { data: tickets } = await admin.from("com_t_user_session_ticket").select("ticket_id").in("contract_id", contractIds);
      const ticketIds = (tickets ?? []).map((t) => t.ticket_id);
      if (ticketIds.length > 0) {
        await admin.from("com_m_lesson_schedule").delete().in("ticket_id", ticketIds);
        await admin.from("com_t_coach_rating").delete().in("ticket_id", ticketIds);
      }
      await admin.from("com_t_user_session_ticket_history").delete().in("contract_id", contractIds);
      await admin.from("com_t_user_session_ticket").delete().in("contract_id", contractIds);
      await admin.from("com_t_user_license_history").delete().in("contract_id", contractIds);
      await admin.from("com_t_user_license").delete().in("contract_id", contractIds);
      await admin.from("com_m_contract").delete().in("contract_id", contractIds);
    }
  }
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
