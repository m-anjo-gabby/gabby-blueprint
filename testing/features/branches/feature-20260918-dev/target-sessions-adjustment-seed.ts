/**
 * ライブセッション管理見直し（admin_adjust_schedule_target_sessions RPC）の
 * データ主体テスト(②)投入スクリプト。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260918-dev/target-sessions-adjustment-seed.ts --env=dev --tag=targetsessions01
 *
 * 投入するデータ:
 *   - 生徒TA: 稼働中の定期スケジュール枠(slotNo=1)を1件。正常系(引き上げ成功・shortfall増加・
 *     セッション未生成)と権限系(生徒/コーチ本人拒否)の両方で使い回す(いずれも対象データの
 *     状態を破壊しない検証のため、共有可能)。
 *   - 生徒TB: 稼働中の定期スケジュール枠(slotNo=1)を1件。異常系(現在値以下・理由空/空白)専用。
 *     いずれも呼び出しが失敗するだけで対象データを変更しないため、同一枠を使い回す。
 *   - 生徒TC: 一時停止(status=0)の定期スケジュール枠(slotNo=1)を1件。非稼働枠の拒否確認専用。
 *
 * テスト完了後にデータを削除する運用のため、cleanup用に
 * target-sessions-adjustment-cleanup.ts を用意している。verify.ts実行後に実行すること。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { assertReleaseApplied } from "../../../helpers/preflight.ts";
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

console.log(`\n=== ライブセッション管理見直し(target_sessions個別調整)②シナリオ投入: env=${env} tag=${TAG} ===`);

// ---------------------------------------------------------------------------
// Preflight: 本シナリオが対象とするRPC群が反映済みか確認
// ---------------------------------------------------------------------------
await assertReleaseApplied(admin, [
  { name: "admin_match_student_with_coach", dummyArgs: { p_ticket_id: "00000000-0000-0000-0000-000000000000", p_coach_id: "00000000-0000-0000-0000-000000000000", p_slot_no: 1, p_day_of_week: 1, p_start_time: "10:00", p_end_time: "10:30" } },
  { name: "fn_schedule_shortfall", dummyArgs: { p_schedule_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "admin_adjust_schedule_target_sessions", dummyArgs: { p_schedule_id: "00000000-0000-0000-0000-000000000000", p_new_target_sessions: 1, p_reason: "preflight" } },
]);
console.log("Preflight OK: 対象RPCはすべて反映済みです。");

// ---------------------------------------------------------------------------
// 共通ヘルパー（feature-20260911-dev/session-lifecycle-refactor-seed.tsと同型）
// ---------------------------------------------------------------------------
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

async function ensureUser(email: string, userType: "0" | "1" | "2", userName: string, clientId: string | null): Promise<string> {
  let userId = await findAuthUserByEmail(email);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error: updErr } = await admin.from("com_m_user").update({ client_id: clientId, user_type: userType, user_name: userName }).eq("id", userId);
  if (updErr) throw updErr;
  return userId;
}

type Plan = { plan_id: string; plan_name: string; plan_name_en: string; contract_type: number; weekly_frequency: number | null; total_sessions: number | null; has_dialogue_practice: boolean };
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
    .insert({ contract_id: contract.contract_id, user_id: params.userId, status: 1, start_date: params.startDate.toISOString(), end_date: params.endDate.toISOString() })
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

/** admin_match_student_with_coach経由で1コマをマッチングさせ、生成されたschedule_idを返す。 */
async function matchViaAdmin(adminClient: SupabaseClient, params: { ticketId: string; coachId: string; slotNo: number; dayOfWeek: number; startTime: string; endTime: string }): Promise<string> {
  const { data, error } = await adminClient.rpc("admin_match_student_with_coach", {
    p_ticket_id: params.ticketId,
    p_coach_id: params.coachId,
    p_slot_no: params.slotNo,
    p_day_of_week: params.dayOfWeek,
    p_start_time: params.startTime,
    p_end_time: params.endTime,
  });
  if (error) throw error;
  return data as string;
}

// ---------------------------------------------------------------------------
// 共通セットアップ: 顧客・コーチ・アドミン
// ---------------------------------------------------------------------------
const clientId = await ensureClient(`【QAテスト】ライブセッション管理見直し検証（${TAG}）`);
const coachEmail = `${TAG}-tsadj-coach@gabby-qa-test.example`;
const coachId = await ensureUser(coachEmail, "2", `QAコーチ（target_sessions調整・${TAG}）`, clientId);

const adminEmail = "qa-admin@gabby-qa-test.example";
let adminUserId = await findAuthUserByEmail(adminEmail);
if (!adminUserId) {
  adminUserId = await ensureUser(adminEmail, "0", "QAアドミン（代理操作用）", null);
} else {
  await admin.from("com_m_user").update({ user_type: "0" }).eq("id", adminUserId);
}

const adminClient: SupabaseClient = await signInAsRole(adminEmail, PASSWORD);
const coachClient: SupabaseClient = await signInAsRole(coachEmail, PASSWORD);

console.log("共通セットアップ完了:", { clientId, coachId, adminUserId });

const STANDARD = await getPlan("LIVE_WEEKLY1_3M");

const summary: Record<string, unknown> = { tag: TAG, clientId, coachId, coachEmail, adminEmail };

// ---------------------------------------------------------------------------
// 生徒TA: 正常系(引き上げ成功・shortfall増加・セッション未生成) + 権限系(生徒/コーチ拒否)の共有枠
// ---------------------------------------------------------------------------
console.log("\n--- 生徒TA: 正常系・権限系の共有枠 ---");
const taEmail = `${TAG}-tsadj-student-ta@gabby-qa-test.example`;
const taId = await ensureUser(taEmail, "1", `QA生徒TA（target_sessions正常系・${TAG}）`, clientId);
const taStart = addDays(TODAY, -30);
const taEnd = addDays(TODAY, 335);
const { ticketId: taTicketId } = await createContractLicenseTicket({ clientId, userId: taId, plan: STANDARD, startDate: taStart, endDate: taEnd, note: `QA自動テスト(${TAG}) 生徒TA target_sessions正常系` });
const taSchedule = await matchViaAdmin(adminClient, { ticketId: taTicketId, coachId, slotNo: 1, dayOfWeek: 1, startTime: "09:00", endTime: "09:30" });
const taStudentClient: SupabaseClient = await signInAsRole(taEmail, PASSWORD);
console.log("生徒TA投入完了:", { taTicketId, taSchedule });

// ---------------------------------------------------------------------------
// 生徒TB: 異常系(現在値以下・理由空/空白)専用。いずれも呼び出しが失敗するだけの枠。
// ---------------------------------------------------------------------------
console.log("\n--- 生徒TB: 異常系(現在値以下・理由空/空白)専用枠 ---");
const tbId = await ensureUser(`${TAG}-tsadj-student-tb@gabby-qa-test.example`, "1", `QA生徒TB（target_sessions異常系・${TAG}）`, clientId);
const tbStart = addDays(TODAY, -30);
const tbEnd = addDays(TODAY, 335);
const { ticketId: tbTicketId } = await createContractLicenseTicket({ clientId, userId: tbId, plan: STANDARD, startDate: tbStart, endDate: tbEnd, note: `QA自動テスト(${TAG}) 生徒TB target_sessions異常系` });
const tbSchedule = await matchViaAdmin(adminClient, { ticketId: tbTicketId, coachId, slotNo: 1, dayOfWeek: 2, startTime: "09:00", endTime: "09:30" });
console.log("生徒TB投入完了:", { tbTicketId, tbSchedule });

// ---------------------------------------------------------------------------
// 生徒TC: 一時停止(status=0)の枠。非稼働枠の拒否確認専用。
// ---------------------------------------------------------------------------
console.log("\n--- 生徒TC: 一時停止(paused)枠 ---");
const tcId = await ensureUser(`${TAG}-tsadj-student-tc@gabby-qa-test.example`, "1", `QA生徒TC（target_sessions非稼働枠・${TAG}）`, clientId);
const tcStart = addDays(TODAY, -30);
const tcEnd = addDays(TODAY, 335);
const { ticketId: tcTicketId } = await createContractLicenseTicket({ clientId, userId: tcId, plan: STANDARD, startDate: tcStart, endDate: tcEnd, note: `QA自動テスト(${TAG}) 生徒TC target_sessions非稼働枠` });
const tcSchedule = await matchViaAdmin(adminClient, { ticketId: tcTicketId, coachId, slotNo: 1, dayOfWeek: 3, startTime: "09:00", endTime: "09:30" });
// admin_adjust_schedule_target_sessions自体の「稼働中のみ許可」を確認するための状態セットアップ。
// status変更そのものは通常release_lesson_schedule_slot RPC経由だが、本テストの目的は
// adjust RPC側のガード確認のため、テストデータ準備としてservice_roleで直接一時停止化する。
const { error: pauseErr } = await admin.from("com_m_lesson_schedule").update({ status: 0 }).eq("schedule_id", tcSchedule);
if (pauseErr) throw pauseErr;
console.log("生徒TC投入完了:", { tcTicketId, tcSchedule, status: "paused(0)" });

// ---------------------------------------------------------------------------
// サインアウト(投入したDBデータ自体は削除しない。verify.ts→cleanup.tsの順で後始末する)
// ---------------------------------------------------------------------------
await adminClient.auth.signOut();
await coachClient.auth.signOut();
await taStudentClient.auth.signOut();

Object.assign(summary, {
  taId, taEmail, taTicketId, taSchedule,
  tbId, tbTicketId, tbSchedule,
  tcId, tcTicketId, tcSchedule,
});

console.log(`\n=== 投入完了 ===`);
console.log(JSON.stringify(summary, null, 2));
console.log("\n次のステップ: target-sessions-adjustment-verify.ts を同じ --env / --tag で実行してください。");
console.log("検証完了後、target-sessions-adjustment-cleanup.ts を同じ --env / --tag で実行してテストデータを削除してください。");
