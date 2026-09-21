/**
 * feature/20260911-dev（コーチMy Studentsグルーピング・直近契約表示機能）のデータ主体テスト(②)を
 * dev/staging環境に投入するスクリプト。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/my-students-grouping-seed.ts --env=dev --tag=mystudents01
 *
 * 既存の他シナリオ（booking-management-renewal/monthly-report等）とは --tag と専用クライアント名で
 * 完全に別名前空間にして衝突を避ける。データは削除しない（ユーザーの指示によりブラウザ確認用に残す）。
 *
 * 本機能はRPCを新設していない（既存テーブルへの直接SELECT + 唯一の状態変化はinvalidate_user_license
 * 経由）ため、preflightでのRPC存在確認は対象外。invalidate_user_licenseは既存リリース(2026-09-08)で
 * 導入済みのため、通常のdev/staging環境であれば追加のpreflightは不要。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { addDays } from "../../../helpers/dates.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;

const admin = await createAdminClient();
const TODAY = new Date();

console.log(`\n=== feature/20260911-dev My Studentsグルーピング②シナリオ投入: env=${env} tag=${TAG} ===`);

// ---------------------------------------------------------------------------
// 共通ヘルパー（既存の monthly-report-seed.ts と同型）
// ---------------------------------------------------------------------------
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

async function ensureUser(email: string, userType: "0" | "1" | "2", userName: string, clientId: string | null): Promise<string> {
  let userId = await findAuthUserByEmail(email);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error: updErr } = await admin
    .from("com_m_user")
    .update({ client_id: clientId, user_type: userType, user_name: userName })
    .eq("id", userId);
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

async function createContractLicenseTicket(params: { clientId: string; userId: string; plan: Plan; startDate: Date; endDate: Date; note: string }) {
  const { data: contract, error: cErr } = await admin
    .from("com_m_contract")
    .insert({
      client_id: params.clientId,
      plan_name: params.plan.plan_name,
      plan_name_en: params.plan.plan_name_en,
      plan_id: params.plan.plan_id,
      max_licenses: 1,
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
  if (cErr) throw cErr;

  const { data: license, error: lErr } = await admin
    .from("com_t_user_license")
    .insert({
      contract_id: contract.contract_id,
      user_id: params.userId,
      status: 1,
      start_date: params.startDate.toISOString(),
      end_date: params.endDate.toISOString(),
    })
    .select("license_id")
    .single();
  if (lErr) throw lErr;

  const { data: ticket, error: tErr } = await admin
    .from("com_t_user_session_ticket")
    .insert({
      license_id: license.license_id,
      contract_id: contract.contract_id,
      user_id: params.userId,
      weekly_frequency: params.plan.weekly_frequency,
      total_sessions: params.plan.total_sessions,
      used_sessions: 0,
    })
    .select("ticket_id")
    .single();
  if (tErr) throw tErr;

  return { contractId: contract.contract_id as string, licenseId: license.license_id as string, ticketId: ticket.ticket_id as string };
}

/** status=1(active)/9(terminated)を指定してスケジュールを直接投入する。sync_coach_student_relationship
 * トリガーが反応し、com_m_coach_student_relationship.is_activeが自動的に再計算される。 */
async function seedSchedule(params: { ticketId: string; studentId: string; coachId: string; slotNo: number; status: 1 | 9; startDate: Date; endDate: Date }): Promise<string> {
  const { data, error } = await admin
    .from("com_m_lesson_schedule")
    .insert({
      ticket_id: params.ticketId,
      student_id: params.studentId,
      coach_id: params.coachId,
      slot_no: params.slotNo,
      day_of_week: params.startDate.getUTCDay(),
      start_time: "10:00:00",
      end_time: "10:30:00",
      coach_timezone: "Asia/Tokyo",
      status: params.status,
      start_date: params.startDate.toISOString().slice(0, 10),
      end_date: params.endDate.toISOString().slice(0, 10),
      // target_sessions(2026-09-14追加、NOT NULL)は本シナリオ(My Studentsグルーピング)では
      // 検証対象外のため、fn_generate_sessions_for_schedule/fn_schedule_shortfallの上限に
      // 引っかからない十分大きな固定値を設定する(KJ-2026-0916-01参照)。
      target_sessions: 999,
    })
    .select("schedule_id")
    .single();
  if (error) throw error;
  return data.schedule_id as string;
}

// ---------------------------------------------------------------------------
// 共通セットアップ: 顧客・コーチ・アドミン
// ---------------------------------------------------------------------------
const clientId = await ensureClient(`【QAテスト】My Studentsグルーピング検証（${TAG}）`);
const coachId = await ensureUser(`${TAG}-mystudents-coach@gabby-qa-test.example`, "2", `QAコーチ（My Students・${TAG}）`, clientId);
const studentAId = await ensureUser(`${TAG}-mystudents-student-a@gabby-qa-test.example`, "1", `QA生徒A（My Students・${TAG}）`, clientId);
const studentBId = await ensureUser(`${TAG}-mystudents-student-b@gabby-qa-test.example`, "1", `QA生徒B（My Students・${TAG}）`, clientId);
const studentCId = await ensureUser(`${TAG}-mystudents-student-c@gabby-qa-test.example`, "1", `QA生徒C（My Students・${TAG}）`, clientId);

const adminEmail = "qa-admin@gabby-qa-test.example";
let adminUserId = await findAuthUserByEmail(adminEmail);
if (!adminUserId) {
  adminUserId = await ensureUser(adminEmail, "0", "QAアドミン（代理操作用）", null);
} else {
  await admin.from("com_m_user").update({ user_type: "0" }).eq("id", adminUserId);
}

const adminClient: SupabaseClient = await signInAsRole(adminEmail, PASSWORD);
const coachClient: SupabaseClient = await signInAsRole(`${TAG}-mystudents-coach@gabby-qa-test.example`, PASSWORD);

console.log("共通セットアップ完了:", { clientId, coachId, studentAId, studentBId, studentCId, adminUserId });

const STANDARD = await getPlan("LIVE_WEEKLY1_3M");
const BUSINESS_PRO = await getPlan("LIVE_WEEKLY2_3M");

// ---------------------------------------------------------------------------
// QA生徒A: 単純な現役契約1件のみ（アクティブ生徒・現役契約）
// ---------------------------------------------------------------------------
console.log("\n--- QA生徒A: 単純な現役契約 ---");
const aStart = addDays(TODAY, -30);
const aEnd = addDays(TODAY, 60);
const { ticketId: aTicketId } = await createContractLicenseTicket({
  clientId,
  userId: studentAId,
  plan: STANDARD,
  startDate: aStart,
  endDate: aEnd,
  note: `QA自動テスト(feature-20260911-dev My Students, tag=${TAG}) 生徒A`,
});
const aScheduleId = await seedSchedule({ ticketId: aTicketId, studentId: studentAId, coachId, slotNo: 1, status: 1, startDate: aStart, endDate: aEnd });
console.log("生徒A投入完了:", { aTicketId, aScheduleId });

// ---------------------------------------------------------------------------
// QA生徒B: 旧契約(終了済みschedule)+新契約(稼働中schedule)。終了日が新しい方が「直近の契約」になるはず
// ---------------------------------------------------------------------------
console.log("\n--- QA生徒B: 契約更新（複数ライセンス） ---");
const bOldStart = addDays(TODAY, -120);
const bOldEnd = addDays(TODAY, -10);
const { ticketId: bOldTicketId } = await createContractLicenseTicket({
  clientId,
  userId: studentBId,
  plan: STANDARD,
  startDate: bOldStart,
  endDate: bOldEnd,
  note: `QA自動テスト(feature-20260911-dev My Students, tag=${TAG}) 生徒B旧契約`,
});
await seedSchedule({ ticketId: bOldTicketId, studentId: studentBId, coachId, slotNo: 1, status: 9, startDate: bOldStart, endDate: bOldEnd });

const bNewStart = addDays(TODAY, -9);
const bNewEnd = addDays(TODAY, 80);
const { ticketId: bNewTicketId } = await createContractLicenseTicket({
  clientId,
  userId: studentBId,
  plan: BUSINESS_PRO,
  startDate: bNewStart,
  endDate: bNewEnd,
  note: `QA自動テスト(feature-20260911-dev My Students, tag=${TAG}) 生徒B新契約`,
});
const bNewScheduleId = await seedSchedule({ ticketId: bNewTicketId, studentId: studentBId, coachId, slotNo: 1, status: 1, startDate: bNewStart, endDate: bNewEnd });
console.log("生徒B投入完了:", { bOldTicketId, bNewTicketId, bNewScheduleId });

// ---------------------------------------------------------------------------
// QA生徒C: 現役契約1件 → アドミンJWTでinvalidate_user_license（過去生徒・終了済み契約になるはず）
// ---------------------------------------------------------------------------
console.log("\n--- QA生徒C: 契約解除（過去生徒） ---");
const cStart = addDays(TODAY, -30);
const cEnd = addDays(TODAY, 60); // 契約期間はまだ先まで残っている状態で明示的に解除する（is_current判定がstatusを見ることの確認）
const { licenseId: cLicenseId, ticketId: cTicketId } = await createContractLicenseTicket({
  clientId,
  userId: studentCId,
  plan: STANDARD,
  startDate: cStart,
  endDate: cEnd,
  note: `QA自動テスト(feature-20260911-dev My Students, tag=${TAG}) 生徒C`,
});
const cScheduleId = await seedSchedule({ ticketId: cTicketId, studentId: studentCId, coachId, slotNo: 1, status: 1, startDate: cStart, endDate: cEnd });
console.log("生徒C投入完了（解除前）:", { cLicenseId, cTicketId, cScheduleId });

// invalidate_user_licenseは管理者専用RPC（CLAUDE.md 6章: service_roleでのRPC呼び出し禁止のため実JWTを使用）
{
  const { error } = await adminClient.rpc("invalidate_user_license", { p_license_id: cLicenseId });
  if (error) throw error;
}
console.log("生徒Cのライセンスをinvalidate_user_licenseで停止しました:", { cLicenseId });

// ---------------------------------------------------------------------------
// サインアウト(後始末: セッション自体は破棄されるだけで、投入したDBデータは残す)
// ---------------------------------------------------------------------------
await adminClient.auth.signOut();
await coachClient.auth.signOut();

console.log(`\n=== 投入完了 ===`);
console.log(
  JSON.stringify(
    {
      tag: TAG,
      clientId,
      coachId,
      coachEmail: `${TAG}-mystudents-coach@gabby-qa-test.example`,
      studentAId,
      studentBId,
      studentCId,
      cLicenseId,
    },
    null,
    2
  )
);
console.log("\n次のステップ: my-students-grouping-verify.ts を同じ --env / --tag で実行してください。");
console.log(`ブラウザ確認用ログイン: email=${TAG}-mystudents-coach@gabby-qa-test.example / password=（QA_LIVE_SESSION_TEST_PASSWORDと同じ共通パスワード）`);
