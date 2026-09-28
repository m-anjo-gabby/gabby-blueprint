/**
 * 契約ユーザーライセンス管理の見直し（com_t_user_license.excl_user_license_active_overlap
 * 排他制約）のデータ主体テスト(②)を dev/staging環境に投入するスクリプト。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20260918-dev/license-management-overhaul-seed.ts --env=dev --tag=licenseoverhaul01
 *
 * 本シナリオは認証(JWT)に依存しないテーブル制約(EXCLUDE constraint)の検証が主目的のため、
 * signInAsRole()は使わずservice_roleのみで完結する（生徒・コーチアカウントへのサインイン自体が
 * 不要。CLAUDE.md 6章の「業務ロジックRPCは実サインインJWTを使う」制約は、auth.uid()に依存する
 * SECURITY DEFINER関数・RLSが対象であり、テーブル制約はservice_roleでも同じ挙動になるため
 * 対象外）。
 *
 * 投入するデータ:
 *   - 生徒A: 現行ターム契約 + 有効ライセンスA1（次ターム前倒し登録・重複禁止・無効化済みとの
 *     共存確認の中心）。次ターム契約（A1と期間が重ならない）も併せて用意する。
 *   - 生徒B: 生徒Aの現行タームとは重ならない、全く別の期間の契約・ライセンスを1件
 *     （排他制約がuser_id単位で独立していることの確認用。生徒Bの既存ライセンスとの
 *     偶発的な重複を避けるため、生徒Aとは意図的に無関係な期間にする）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";
import { addDays } from "../../../helpers/dates.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";

const admin = await createAdminClient();
const TODAY = new Date();

console.log(`\n=== ライセンス管理見直し②シナリオ投入: env=${env} tag=${TAG} ===`);

const CLIENT_NAME = `【QAテスト】ライセンス管理見直し検証（${TAG}）`;

async function ensureClient(name: string): Promise<string> {
  const { data: existing } = await admin.from("com_m_client").select("client_id").eq("client_name", name).maybeSingle();
  if (existing) return existing.client_id as string;
  const { data, error } = await admin.from("com_m_client").insert({ client_name: name, client_type: 1, industry_type: 1 }).select("client_id").single();
  if (error) throw error;
  return data.client_id as string;
}

async function findAuthUserByEmail(email: string): Promise<string | undefined> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return undefined;
}

async function ensureUser(email: string, userName: string, clientId: string): Promise<string> {
  let userId = await findAuthUserByEmail(email);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: `${TAG}-Dummy#Pass1`, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error: updErr } = await admin.from("com_m_user").update({ client_id: clientId, user_type: "1", user_name: userName }).eq("id", userId);
  if (updErr) throw updErr;
  return userId;
}

type Plan = {
  plan_id: string;
  plan_name: string;
  plan_name_en: string;
  contract_type: number;
  weekly_frequency: number | null;
  total_sessions: number | null;
  has_dialogue_practice: boolean;
};

async function getPlan(planCode: string): Promise<Plan> {
  const { data, error } = await admin.from("com_m_contract_plan").select("*").eq("plan_code", planCode).single();
  if (error) throw error;
  return data as Plan;
}

async function ensureContract(params: { clientId: string; plan: Plan; startDate: Date; endDate: Date; note: string }): Promise<string> {
  const { data: existing } = await admin.from("com_m_contract").select("contract_id").eq("note", params.note).maybeSingle();
  if (existing) return existing.contract_id as string;

  const { data, error } = await admin
    .from("com_m_contract")
    .insert({
      client_id: params.clientId,
      plan_name: params.plan.plan_name,
      plan_name_en: params.plan.plan_name_en,
      plan_id: params.plan.plan_id,
      max_licenses: 3,
      start_date: params.startDate.toISOString(),
      end_date: params.endDate.toISOString(),
      status: 1,
      contract_type: params.plan.contract_type,
      weekly_frequency: params.plan.weekly_frequency,
      total_sessions: params.plan.total_sessions,
      has_dialogue_practice: params.plan.has_dialogue_practice,
      note: params.note,
    })
    .select("contract_id")
    .single();
  if (error) throw error;
  return data.contract_id as string;
}

async function ensureActiveLicense(params: { contractId: string; userId: string; startDate: Date; endDate: Date }): Promise<string> {
  const { data: existing } = await admin
    .from("com_t_user_license")
    .select("license_id")
    .eq("contract_id", params.contractId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (existing) return existing.license_id as string;

  const { data, error } = await admin
    .from("com_t_user_license")
    .insert({
      contract_id: params.contractId,
      user_id: params.userId,
      status: 1,
      start_date: params.startDate.toISOString(),
      end_date: params.endDate.toISOString(),
    })
    .select("license_id")
    .single();
  if (error) throw error;
  return data.license_id as string;
}

const clientId = await ensureClient(CLIENT_NAME);
const plan = await getPlan("BLUEPRINT_ONLY");

const studentAId = await ensureUser(`${TAG}-license-student-a@gabby-qa-test.example`, `【QAテスト】生徒A(${TAG})`, clientId);
const studentBId = await ensureUser(`${TAG}-license-student-b@gabby-qa-test.example`, `【QAテスト】生徒B(${TAG})`, clientId);

// 生徒A: 現行ターム（90日前〜30日後）+ 次ターム（現行の終了日翌日〜120日後、期間は重ならない）
const currentStart = addDays(TODAY, -90);
const currentEnd = addDays(TODAY, 30);
const nextStart = addDays(TODAY, 31);
const nextEnd = addDays(TODAY, 120);

const contractACurrentId = await ensureContract({
  clientId,
  plan,
  startDate: currentStart,
  endDate: currentEnd,
  note: `${TAG} 生徒A 現行ターム`,
});
const contractANextId = await ensureContract({
  clientId,
  plan,
  startDate: nextStart,
  endDate: nextEnd,
  note: `${TAG} 生徒A 次ターム`,
});
const licenseA1Id = await ensureActiveLicense({
  contractId: contractACurrentId,
  userId: studentAId,
  startDate: currentStart,
  endDate: currentEnd,
});

// 生徒B: 生徒Aの現行タームとは重ならない、全く別の期間の契約・ライセンス
// （user_id単位の独立性確認用。生徒A現行タームの期間をそのまま生徒Bへ挿入するテストを行うため、
//  生徒B自身の既存ライセンスとは重ならない期間にしておく必要がある）
const studentBStart = addDays(TODAY, 200);
const studentBEnd = addDays(TODAY, 260);
const contractBId = await ensureContract({
  clientId,
  plan,
  startDate: studentBStart,
  endDate: studentBEnd,
  note: `${TAG} 生徒B`,
});
const licenseB1Id = await ensureActiveLicense({
  contractId: contractBId,
  userId: studentBId,
  startDate: studentBStart,
  endDate: studentBEnd,
});

console.log("投入完了:");
console.log({
  clientId,
  studentAId,
  studentBId,
  contractACurrentId,
  contractANextId,
  contractBId,
  licenseA1Id,
  licenseB1Id,
});
