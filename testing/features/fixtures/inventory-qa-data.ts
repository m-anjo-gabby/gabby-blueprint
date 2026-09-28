/**
 * dev/staging上のQAテストデータ（@gabby-qa-test.example のユーザー、【QA*】で始まる顧客）を
 * 読み取り専用で棚卸しするスクリプト。固定フィクスチャ（testing/FIXTURES.md）と、過去の
 * ブランチ検証で残った使い捨てデータ（${TAG}付き）を区別して一覧表示する。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/fixtures/inventory-qa-data.ts --env=staging
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../helpers/env.ts";
import { createAdminClient } from "../../helpers/auth.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const QA_EMAIL_DOMAIN = "@gabby-qa-test.example";
const admin = await createAdminClient();

console.log(`\n=== QAテストデータ棚卸し: env=${env} ===`);

const qaUsers: { id: string; email: string; createdAt: string }[] = [];
for (let page = 1; page <= 50; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  for (const u of data.users) {
    if (u.email?.endsWith(QA_EMAIL_DOMAIN)) qaUsers.push({ id: u.id, email: u.email, createdAt: u.created_at });
  }
  if (data.users.length < 200) break;
}

const { data: clients, error: clientErr } = await admin
  .from("com_m_client")
  .select("client_id, client_name, insert_date")
  .like("client_name", "【QA%")
  .order("insert_date");
if (clientErr) throw clientErr;

const clientIds = (clients ?? []).map((c) => c.client_id as string);
const { data: contracts, error: contractErr } = clientIds.length
  ? await admin.from("com_m_contract").select("contract_id, client_id, status").in("client_id", clientIds)
  : { data: [], error: null };
if (contractErr) throw contractErr;

const userIds = qaUsers.map((u) => u.id);
const { data: profiles, error: profileErr } = userIds.length
  ? await admin.from("com_m_user").select("id, user_name, user_type, client_id").in("id", userIds)
  : { data: [], error: null };
if (profileErr) throw profileErr;
const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));
const clientNameById = new Map((clients ?? []).map((c) => [c.client_id as string, c.client_name as string]));

console.log(`\n--- 顧客（【QA*】） ${clients?.length ?? 0}件 ---`);
for (const c of clients ?? []) {
  const n = (contracts ?? []).filter((k) => k.client_id === c.client_id).length;
  const members = (profiles ?? []).filter((p) => p.client_id === c.client_id).length;
  console.log(`${c.client_id}  契約${n}件  QAユーザー${members}名  ${c.client_name}`);
}

console.log(`\n--- ユーザー（*${QA_EMAIL_DOMAIN}） ${qaUsers.length}名 ---`);
for (const u of qaUsers.sort((a, b) => a.email.localeCompare(b.email))) {
  const p = profileById.get(u.id);
  const clientName = p?.client_id ? clientNameById.get(p.client_id as string) ?? `(非QA顧客 ${p.client_id})` : "-";
  console.log(`${u.email.padEnd(58)} type=${p?.user_type ?? "?"}  ${p?.user_name ?? ""}  / ${clientName}`);
}
