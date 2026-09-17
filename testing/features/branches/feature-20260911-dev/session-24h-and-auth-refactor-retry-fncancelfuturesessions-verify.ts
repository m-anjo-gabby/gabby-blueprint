/**
 * 2026-09-17のstaging検証で、fn_cancel_future_sessions内のsmallintキャスト不足
 * (KJ-2026-0917-05)により、session-24h-and-auth-refactor-verify.tsの10節の一部
 * (release_lesson_schedule_slot/invalidate_user_licenseのアドミン成功系チェック)がNGになった。
 * 修正後のリリースSQLをstagingへ再適用してもらった上で、同じseedデータ(生徒T4)に対して
 * この2ブロックだけを再実行するための補助スクリプト(KJ-2026-0915-02: verify全体の再実行は
 * 既に成功済みの破壊的操作が重複エラーになるため不可)。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/session-24h-and-auth-refactor-retry-fncancelfuturesessions-verify.ts --env=staging --tag=stg0917
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { writeResultLog } from "../../../helpers/results.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。");
const PASSWORD: string = PASSWORD_ENV;

const admin = await createAdminClient();
console.log(`\n=== session-24h-and-auth-refactor 10節(release_lesson_schedule_slot/invalidate_user_license) 再検証: env=${env} tag=${TAG} ===`);

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK" : "NG"}: ${name}${detail ? ` (${detail})` : ""}`);
}
function isAuthError(message: string | undefined): boolean {
  return !!message && /not authorized/i.test(message);
}

async function findUserByEmail(email: string): Promise<string> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`ユーザーが見つかりません: ${email}`);
}

const coach1Email = `${TAG}-24h-coach1@gabby-qa-test.example`;
const t4Email = `${TAG}-24h-student-t4@gabby-qa-test.example`;
const adminEmail = "qa-admin@gabby-qa-test.example";

const t4Id = await findUserByEmail(t4Email);
const coach1Id = await findUserByEmail(coach1Email);
const coach1Client: SupabaseClient = await signInAsRole(coach1Email, PASSWORD);
const adminClient: SupabaseClient = await signInAsRole(adminEmail, PASSWORD);
console.log("対象ユーザー特定完了:", { coach1Id, t4Id });

type ScheduleRow = { schedule_id: string };
async function getSchedule(coachId: string, studentId: string): Promise<ScheduleRow> {
  const { data, error } = await admin.from("com_m_lesson_schedule").select("schedule_id").eq("coach_id", coachId).eq("student_id", studentId).eq("status", 1).single();
  if (error) throw error;
  return data as ScheduleRow;
}

const t4Schedule = await getSchedule(coach1Id, t4Id);

{
  const { error: wrongRoleErr } = await coach1Client.rpc("release_lesson_schedule_slot", { p_schedule_id: t4Schedule.schedule_id });
  check("release_lesson_schedule_slot: 担当コーチC1は権限エラーになる(アドミン専用)", isAuthError(wrongRoleErr?.message), wrongRoleErr?.message);

  const { error } = await adminClient.rpc("release_lesson_schedule_slot", { p_schedule_id: t4Schedule.schedule_id });
  check("release_lesson_schedule_slot: アドミンは成功する", !error, error?.message);
  const { data: scheduleRow } = await admin.from("com_m_lesson_schedule").select("status").eq("schedule_id", t4Schedule.schedule_id).single();
  check("release_lesson_schedule_slot: スケジュールがstatus=9(terminated)になる", scheduleRow?.status === 9, `status=${scheduleRow?.status}`);
}
{
  const { data: t4License, error } = await admin.from("com_t_user_license").select("license_id").eq("user_id", t4Id).single();
  if (error) throw error;

  const { error: wrongRoleErr } = await coach1Client.rpc("invalidate_user_license", { p_license_id: t4License.license_id });
  check("invalidate_user_license: 担当コーチC1は権限エラーになる(アドミン専用)", isAuthError(wrongRoleErr?.message), wrongRoleErr?.message);

  const { error: invalidateErr } = await adminClient.rpc("invalidate_user_license", { p_license_id: t4License.license_id });
  check("invalidate_user_license: アドミンは成功する", !invalidateErr, invalidateErr?.message);
  const { data: licenseRow } = await admin.from("com_t_user_license").select("status").eq("license_id", t4License.license_id).single();
  check("invalidate_user_license: ライセンスがstatus=0(停止)になる", licenseRow?.status === 0, `status=${licenseRow?.status}`);
}

console.log("\n=== 検証結果(10節の一部のみ) ===");
console.table(checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail ?? "" })));

writeResultLog({ scenario: "features/branches/feature-20260911-dev/session-24h-and-auth-refactor-retry-fncancelfuturesessions", env, tag: TAG, checks });

const failedChecks = checks.filter((c) => !c.ok);
if (failedChecks.length > 0) {
  console.error(`\nNG: ${failedChecks.length}件の不整合`);
  process.exit(1);
} else {
  console.log(`\nOK: 全${checks.length}件のチェックに合格`);
}
