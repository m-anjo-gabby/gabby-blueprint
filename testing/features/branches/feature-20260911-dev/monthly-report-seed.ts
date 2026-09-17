/**
 * feature/20260911-dev（月次コーチングレポート機能）のデータ主体テスト(②)を
 * dev/staging環境に投入するスクリプト。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/monthly-report-seed.ts --env=dev --tag=mreport01
 *
 * 既存の他シナリオ（booking-management-renewal等）とは --tag と専用クライアント名で
 * 完全に別名前空間にして衝突を避ける。データは削除しない（ユーザーの指示によりブラウザ確認用に残す）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { assertReleaseApplied } from "../../../helpers/preflight.ts";
import { addDays, jstDateTimeISO, toDateOnlyString } from "../../../helpers/dates.ts";
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

console.log(`\n=== feature/20260911-dev 月次コーチングレポート②シナリオ投入: env=${env} tag=${TAG} ===`);

// ---------------------------------------------------------------------------
// Preflight: 新規RPCの存在確認
// ---------------------------------------------------------------------------
await assertReleaseApplied(admin, [
  {
    name: "get_coach_monthly_active_students",
    dummyArgs: { p_coach_id: "00000000-0000-0000-0000-000000000000", p_report_month: "2026-01-01" },
  },
  {
    name: "get_coach_monthly_sessions",
    dummyArgs: { p_coach_id: "00000000-0000-0000-0000-000000000000", p_report_month: "2026-01-01" },
  },
]);
console.log("preflight OK: 新規RPCはすべて反映済み（get_coach_monthly_active_students/get_coach_monthly_sessions）");
// approve/revokeは管理者専用チェックが先に走るため、ダミー引数でも「not authorized」以外の
// エラー（未定義関数）にならないことだけをここで別途確認する。
{
  const { error } = await admin.rpc("approve_coach_monthly_report", {
    p_coach_id: "00000000-0000-0000-0000-000000000000",
    p_report_month: "2026-01-01",
    p_approved_by: "00000000-0000-0000-0000-000000000000",
  });
  if (error?.code === "42883" || error?.code === "PGRST202") {
    throw new Error("approve_coach_monthly_report が未反映です。リリーススクリプトの適用状況を確認してください。");
  }
}
{
  const { error } = await admin.rpc("revoke_coach_monthly_report_approval", {
    p_coach_id: "00000000-0000-0000-0000-000000000000",
    p_report_month: "2026-01-01",
  });
  if (error?.code === "42883" || error?.code === "PGRST202") {
    throw new Error("revoke_coach_monthly_report_approval が未反映です。リリーススクリプトの適用状況を確認してください。");
  }
}
console.log("preflight OK: approve/revoke_coach_monthly_report* も反映済み");

// ---------------------------------------------------------------------------
// 共通ヘルパー（既存の feature-20260911-dev/seed.ts と同型）
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

async function seedSchedule(params: { ticketId: string; studentId: string; coachId: string; dayOfWeek: number; startDate: Date; endDate: Date }): Promise<string> {
  const { data, error } = await admin
    .from("com_m_lesson_schedule")
    .insert({
      ticket_id: params.ticketId,
      student_id: params.studentId,
      coach_id: params.coachId,
      slot_no: 1,
      day_of_week: params.dayOfWeek,
      start_time: "10:00:00",
      end_time: "10:30:00",
      coach_timezone: "Asia/Tokyo",
      status: 1,
      start_date: toDateOnlyString(params.startDate),
      end_date: toDateOnlyString(params.endDate),
    })
    .select("schedule_id")
    .single();
  if (error) throw error;
  return data.schedule_id as string;
}

/** 指定日時(JST)にstatus=scheduledの行を直接投入する */
async function seedSessionRow(params: { scheduleId: string; ticketId: string; studentId: string; coachId: string; date: Date; hour: number; minute: number }): Promise<string> {
  const { data, error } = await admin
    .from("com_t_session")
    .insert({
      schedule_id: params.scheduleId,
      ticket_id: params.ticketId,
      student_id: params.studentId,
      coach_id: params.coachId,
      start_datetime: jstDateTimeISO(params.date, params.hour, params.minute),
      end_datetime: jstDateTimeISO(params.date, params.hour, params.minute + 30),
      status: 1,
    })
    .select("session_id")
    .single();
  if (error) throw error;
  return data.session_id as string;
}

/** 現在時刻からのオフセット(ミリ秒)でstatus=scheduledの行を直接投入する(12時間境界のテスト用) */
async function seedSessionRowAt(params: { scheduleId: string; ticketId: string; studentId: string; coachId: string; startMs: number; durationMinutes: number }): Promise<string> {
  const start = new Date(params.startMs);
  const end = new Date(params.startMs + params.durationMinutes * 60_000);
  const { data, error } = await admin
    .from("com_t_session")
    .insert({
      schedule_id: params.scheduleId,
      ticket_id: params.ticketId,
      student_id: params.studentId,
      coach_id: params.coachId,
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      status: 1,
    })
    .select("session_id")
    .single();
  if (error) throw error;
  return data.session_id as string;
}

/** 「前月」の指定日(JST基準の暦日)を返す。当月・当月をまたぐ相対日数計算による月境界の不安定さを避けるため、
 * カレンダー月そのものを1つ前にずらして固定する。 */
function previousMonthDate(day: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day));
}

function toReportMonthString(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// ---------------------------------------------------------------------------
// 共通セットアップ: 顧客・コーチ・アドミン・生徒
// ---------------------------------------------------------------------------
const clientId = await ensureClient(`【QAテスト】月次コーチングレポート検証（${TAG}）`);
const coachId = await ensureUser(`${TAG}-mreport-coach@gabby-qa-test.example`, "2", `QAコーチ（月次レポート・${TAG}）`, clientId);
const otherCoachId = await ensureUser(`${TAG}-mreport-coach-other@gabby-qa-test.example`, "2", `QA他コーチ（月次レポート・${TAG}）`, clientId);
const studentId = await ensureUser(`${TAG}-mreport-student@gabby-qa-test.example`, "1", `QA生徒（月次レポート・${TAG}）`, clientId);

const adminEmail = "qa-admin@gabby-qa-test.example";
let adminUserId = await findAuthUserByEmail(adminEmail);
if (!adminUserId) {
  adminUserId = await ensureUser(adminEmail, "0", "QAアドミン（代理操作用）", null);
} else {
  await admin.from("com_m_user").update({ user_type: "0" }).eq("id", adminUserId);
}

const adminClient: SupabaseClient = await signInAsRole(adminEmail, PASSWORD);
const coachClient: SupabaseClient = await signInAsRole(`${TAG}-mreport-coach@gabby-qa-test.example`, PASSWORD);
const otherCoachClient: SupabaseClient = await signInAsRole(`${TAG}-mreport-coach-other@gabby-qa-test.example`, PASSWORD);
const studentClient: SupabaseClient = await signInAsRole(`${TAG}-mreport-student@gabby-qa-test.example`, PASSWORD);

console.log("共通セットアップ完了:", { clientId, coachId, otherCoachId, studentId, adminUserId });

// ---------------------------------------------------------------------------
// 契約/ライセンス/チケット（前月〜未来90日でカバーし、前月・当月どちらの集計でも「有効契約」に該当させる）
// ---------------------------------------------------------------------------
const WEEKLY1 = await getPlan("LIVE_WEEKLY1_3M");
const contractStart = previousMonthDate(1);
const contractEnd = addDays(TODAY, 90);
const { ticketId } = await createContractLicenseTicket({
  clientId,
  userId: studentId,
  plan: WEEKLY1,
  startDate: contractStart,
  endDate: contractEnd,
  note: `QA自動テスト(feature-20260911-dev 月次レポート, tag=${TAG})`,
});
const scheduleId = await seedSchedule({ ticketId, studentId, coachId, dayOfWeek: previousMonthDate(5).getUTCDay(), startDate: contractStart, endDate: contractEnd });

console.log("契約/ライセンス/チケット/スケジュール投入完了:", { ticketId, scheduleId, contractStart: contractStart.toISOString(), contractEnd: contractEnd.toISOString() });

// ---------------------------------------------------------------------------
// 前月分: 完了/No show/早期終了の同日クラスタ(3件) + 別日の未処理セッション(1件)
// ---------------------------------------------------------------------------
console.log("\n--- 前月分: カウント規則・注意色クラスタ ---");
const clusterDay = previousMonthDate(5);
const unresolvedDay = previousMonthDate(12);
const reportMonthPrev = toReportMonthString(clusterDay);

const sessionCompleted = await seedSessionRow({ scheduleId, ticketId, studentId, coachId, date: clusterDay, hour: 10, minute: 0 });
const sessionNoShow = await seedSessionRow({ scheduleId, ticketId, studentId, coachId, date: clusterDay, hour: 11, minute: 0 });
const sessionEarlyEnded = await seedSessionRow({ scheduleId, ticketId, studentId, coachId, date: clusterDay, hour: 12, minute: 0 });
const sessionUnresolved = await seedSessionRow({ scheduleId, ticketId, studentId, coachId, date: unresolvedDay, hour: 10, minute: 0 });

// resolve_stale_session はコーチ本人の実JWTで呼ぶ(CLAUDE.md 6章: service_roleでのRPC呼び出し禁止)
{
  const { error } = await coachClient.rpc("resolve_stale_session", { p_session_id: sessionCompleted, p_resolved_status: 2, p_reason: "QA自動テスト: 完了扱いへ解決" });
  if (error) throw error;
}
{
  const { error } = await coachClient.rpc("resolve_stale_session", { p_session_id: sessionNoShow, p_resolved_status: 6, p_reason: "QA自動テスト: No show扱いへ解決" });
  if (error) throw error;
}
{
  const { error } = await coachClient.rpc("resolve_stale_session", { p_session_id: sessionEarlyEnded, p_resolved_status: 7, p_reason: "QA自動テスト: 早期終了扱いへ解決" });
  if (error) throw error;
}
// sessionUnresolved は意図的に resolve_stale_session を呼ばず、status=1のまま(終了処理漏れ)残す

console.log("前月分クラスタ投入完了:", { reportMonthPrev, clusterDay: toDateOnlyString(clusterDay), sessionCompleted, sessionNoShow, sessionEarlyEnded, sessionUnresolved: `${sessionUnresolved}(未処理のまま)` });

// ---------------------------------------------------------------------------
// 当月分: 12時間以内キャンセル(カウント対象) / コーチキャンセル・アドミン代理キャンセル(対象外)
// ---------------------------------------------------------------------------
console.log("\n--- 当月分: 12時間境界・キャンセル種別ごとの集計対象確認 ---");
const HOUR_MS = 60 * 60 * 1000;
const reportMonthCurrent = toReportMonthString(TODAY);

const sessionWithin12h = await seedSessionRowAt({ scheduleId, ticketId, studentId, coachId, startMs: Date.now() + 6 * HOUR_MS, durationMinutes: 25 });
const sessionCoachCancel = await seedSessionRowAt({ scheduleId, ticketId, studentId, coachId, startMs: Date.now() + 10 * 24 * HOUR_MS, durationMinutes: 25 });
const sessionAdminCancel = await seedSessionRowAt({ scheduleId, ticketId, studentId, coachId, startMs: Date.now() + 12 * 24 * HOUR_MS, durationMinutes: 25 });
// まだ実施されていない通常の予定(status=1のまま、意図的にどのRPCも呼ばない)。
// get_coach_monthly_sessionsの一覧から除外されることを確認するためのデータ。
const sessionFutureScheduled = await seedSessionRowAt({ scheduleId, ticketId, studentId, coachId, startMs: Date.now() + 8 * 24 * HOUR_MS, durationMinutes: 25 });

// 生徒本人の実JWTで12時間以内キャンセル(ticket_refunded=falseになる想定)
{
  const { error } = await studentClient.rpc("cancel_session", {
    p_session_id: sessionWithin12h,
    p_reason: "QA自動テスト: 12時間以内キャンセル",
    p_proposed_slots: null,
    p_admin_refund_ticket: null,
  });
  if (error) throw error;
}
// コーチ本人の実JWTでキャンセル(常にticket_refunded=true、カウント対象外)
{
  const { error } = await coachClient.rpc("cancel_session", {
    p_session_id: sessionCoachCancel,
    p_reason: "QA自動テスト: コーチ都合キャンセル(集計対象外確認)",
    p_proposed_slots: null,
    p_admin_refund_ticket: null,
  });
  if (error) throw error;
}
// アドミンの実JWTで代理キャンセル(status=cancelled_by_admin、カウント対象外)
{
  const { error } = await adminClient.rpc("cancel_session", {
    p_session_id: sessionAdminCancel,
    p_reason: "QA自動テスト: アドミン代理キャンセル(集計対象外確認)",
    p_proposed_slots: null,
    p_admin_refund_ticket: true,
    p_as_admin: true,
  });
  if (error) throw error;
}

console.log("当月分投入完了:", { reportMonthCurrent, sessionWithin12h, sessionCoachCancel, sessionAdminCancel, sessionFutureScheduled: `${sessionFutureScheduled}(未実施のまま)` });

// ---------------------------------------------------------------------------
// サインアウト(後始末: セッション自体は破棄されるだけで、投入したDBデータは残す)
// ---------------------------------------------------------------------------
await adminClient.auth.signOut();
await coachClient.auth.signOut();
await otherCoachClient.auth.signOut();
await studentClient.auth.signOut();

console.log(`\n=== 投入完了 ===`);
console.log(
  JSON.stringify(
    {
      tag: TAG,
      clientId,
      coachId,
      otherCoachId,
      studentId,
      adminUserId,
      reportMonthPrev,
      reportMonthCurrent,
      sessions: { sessionCompleted, sessionNoShow, sessionEarlyEnded, sessionUnresolved, sessionWithin12h, sessionCoachCancel, sessionAdminCancel, sessionFutureScheduled },
    },
    null,
    2
  )
);
console.log("\n次のステップ: monthly-report-verify.ts を同じ --env / --tag で実行してください。");
