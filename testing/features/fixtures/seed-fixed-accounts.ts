/**
 * testing/FIXTURES.md 記載の「固定アカウント」を投入する冪等スクリプト。
 * testing/features/branches/ のブランチ検証用シード（${TAG}付き・使い捨て前提）とは異なり、
 * 本スクリプトが作るアカウントは恒久的に使い回す前提（TAGなし、削除しない）。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/fixtures/seed-fixed-accounts.ts --env=dev
 *
 * 現時点で投入する範囲: qa-coach-ca-01 / qa-student-01 とその担当関係（週1回契約・月曜18:00
 * バンクーバー時間）。qa-coach-us-01 / qa-adminはFIXTURES.mdに記載済みだが、本スクリプトの
 * 対象外（qa-adminは既存の共有フィクスチャを別途利用、qa-coach-us-01は必要になった時点で追加）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../helpers/auth.ts";
import { assertReleaseApplied } from "../../helpers/preflight.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;

const CLIENT_NAME = "【QA固定】E2E/データ主体共通アカウント";
const COACH_EMAIL = "qa-coach-ca-01@gabby-qa-test.example";
const STUDENT_EMAIL = "qa-student-01@gabby-qa-test.example";
const COACH_TIMEZONE = "America/Vancouver";

const admin = await createAdminClient();

console.log(`\n=== 固定アカウント投入: env=${env} ===`);

await assertReleaseApplied(admin, [
  { name: "admin_match_student_with_coach", dummyArgs: { p_ticket_id: "00000000-0000-0000-0000-000000000000", p_coach_id: "00000000-0000-0000-0000-000000000000", p_slot_no: 1, p_day_of_week: 1, p_start_time: "10:00:00", p_end_time: "10:30:00" } },
]);
console.log("preflight OK: admin_match_student_with_coach は反映済み");

async function ensureClient(name: string): Promise<string> {
  const { data: existing } = await admin.from("com_m_client").select("client_id").eq("client_name", name).maybeSingle();
  if (existing) return existing.client_id as string;
  const { data, error } = await admin
    .from("com_m_client")
    .insert({ client_name: name, client_type: 1, industry_type: 1 })
    .select("client_id")
    .single();
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

async function ensureUser(params: {
  email: string;
  userType: "0" | "1" | "2";
  userName: string;
  clientId: string | null;
  timezone?: string;
}): Promise<string> {
  let userId = await findAuthUserByEmail(params.email);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email: params.email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error: updErr } = await admin
    .from("com_m_user")
    .update({
      client_id: params.clientId,
      user_type: params.userType,
      user_name: params.userName,
      ...(params.timezone ? { timezone: params.timezone } : {}),
    })
    .eq("id", userId);
  if (updErr) throw updErr;
  return userId;
}

/** FIXTURES.md記載のコーチペルソナAvailability: 月・水・金 18:00〜22:00（コーチのローカル時刻） */
async function ensureCoachAvailability(coachId: string): Promise<void> {
  const { data: existing } = await admin.from("com_m_coach_availability").select("availability_id").eq("coach_id", coachId).limit(1);
  if (existing && existing.length > 0) return;
  const rows = [1, 3, 5].map((dow) => ({
    coach_id: coachId,
    day_of_week: dow,
    start_time: "18:00:00",
    end_time: "22:00:00",
  }));
  const { error } = await admin.from("com_m_coach_availability").insert(rows);
  if (error) throw error;
}

async function ensureCoachStudentRelationship(studentId: string, coachId: string, adminClient: SupabaseClient): Promise<void> {
  const { data: existing } = await admin
    .from("com_m_coach_student_relationship")
    .select("relationship_id")
    .eq("student_id", studentId)
    .eq("coach_id", coachId)
    .eq("is_active", true)
    .maybeSingle();
  if (existing) {
    console.log("担当関係は既に存在します（スキップ）:", existing.relationship_id);
    return;
  }

  const { data: plan, error: planErr } = await admin.from("com_m_contract_plan").select("*").eq("plan_code", "LIVE_WEEKLY1_3M").single();
  if (planErr) throw planErr;

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 90);

  const { data: contract, error: cErr } = await admin
    .from("com_m_contract")
    .insert({
      client_id: (await ensureClient(CLIENT_NAME)),
      plan_name: plan.plan_name,
      plan_name_en: plan.plan_name_en,
      plan_id: plan.plan_id,
      max_licenses: 1,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      status: 1,
      contract_type: plan.contract_type,
      weekly_frequency: plan.weekly_frequency,
      total_sessions: plan.total_sessions,
      has_dialogue_practice: plan.has_dialogue_practice,
      note: "固定アカウント（testing/FIXTURES.md）用の担当関係確立",
    })
    .select("contract_id")
    .single();
  if (cErr) throw cErr;

  const { data: license, error: lErr } = await admin
    .from("com_t_user_license")
    .insert({
      contract_id: contract.contract_id,
      user_id: studentId,
      status: 1,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    })
    .select("license_id")
    .single();
  if (lErr) throw lErr;

  const { data: ticket, error: tErr } = await admin
    .from("com_t_user_session_ticket")
    .insert({
      license_id: license.license_id,
      contract_id: contract.contract_id,
      user_id: studentId,
      weekly_frequency: plan.weekly_frequency,
      total_sessions: plan.total_sessions,
      used_sessions: 0,
    })
    .select("ticket_id")
    .single();
  if (tErr) throw tErr;

  // コーチのAvailability（月・水・金 18:00〜22:00）に沿う月曜18:00枠でマッチング成立させる
  const { data: scheduleId, error: matchErr } = await adminClient.rpc("admin_match_student_with_coach", {
    p_ticket_id: ticket.ticket_id,
    p_coach_id: coachId,
    p_slot_no: 1,
    p_day_of_week: 1, // 月
    p_start_time: "18:00:00",
    p_end_time: "18:30:00",
  });
  if (matchErr) throw matchErr;

  console.log("担当関係を新規確立しました:", { ticketId: ticket.ticket_id, scheduleId });
}

const clientId = await ensureClient(CLIENT_NAME);
const coachId = await ensureUser({ email: COACH_EMAIL, userType: "2", userName: "QAコーチCA01", clientId, timezone: COACH_TIMEZONE });
const studentId = await ensureUser({ email: STUDENT_EMAIL, userType: "1", userName: "QA生徒01", clientId });
await ensureCoachAvailability(coachId);

const adminEmail = "qa-admin@gabby-qa-test.example";
let adminUserId = await findAuthUserByEmail(adminEmail);
if (!adminUserId) {
  adminUserId = await ensureUser({ email: adminEmail, userType: "0", userName: "QAアドミン", clientId: null });
} else {
  await admin.from("com_m_user").update({ user_type: "0" }).eq("id", adminUserId);
}
const adminClient = await signInAsRole(adminEmail, PASSWORD);

await ensureCoachStudentRelationship(studentId, coachId, adminClient);

console.log("\n=== 投入完了 ===");
console.log({ clientId, coachId, studentId, coachEmail: COACH_EMAIL, studentEmail: STUDENT_EMAIL });
