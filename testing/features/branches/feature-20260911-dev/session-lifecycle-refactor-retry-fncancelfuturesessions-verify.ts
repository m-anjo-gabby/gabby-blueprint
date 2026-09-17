/**
 * 2026-09-17のstaging検証で、fn_cancel_future_sessions未反映(KJ-2026-0917-02)により
 * session-lifecycle-refactor-verify.tsの5-6節(release_lesson_schedule_slot/生徒SE、
 * invalidate_user_license/生徒SF)がNGになった。fn_cancel_future_sessionsのstaging反映後、
 * 同じseedデータ(生徒SE/SF)に対してこの2節だけを再実行するための補助スクリプト。
 *
 * session-lifecycle-refactor-verify.ts全体を再実行すると、生徒SA〜SDに対する既に成功した
 * 破壊的操作(cancel_session/resolve_stale_session等)が「既に処理済みのセッションへの
 * 重複操作」として失敗するため(KJ-2026-0915-02: verifyスクリプトは再実行不可、
 * cleanup→seed→verifyが必要)、seedのやり直しが不要な生徒SE/SFのみを対象に切り出した。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/session-lifecycle-refactor-retry-fncancelfuturesessions-verify.ts --env=staging --tag=stg0917
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { writeResultLog } from "../../../helpers/results.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。");
const PASSWORD: string = PASSWORD_ENV;

const admin = await createAdminClient();
console.log(`\n=== session-lifecycle-refactor 5-6節 再検証(fn_cancel_future_sessions反映後): env=${env} tag=${TAG} ===`);

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK" : "NG"}: ${name}${detail ? ` (${detail})` : ""}`);
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

const coachId = await findUserByEmail(`${TAG}-lifecycle-coach@gabby-qa-test.example`);
const seId = await findUserByEmail(`${TAG}-lifecycle-student-se@gabby-qa-test.example`);
const sfId = await findUserByEmail(`${TAG}-lifecycle-student-sf@gabby-qa-test.example`);
const adminClient = await signInAsRole("qa-admin@gabby-qa-test.example", PASSWORD);
console.log("対象ユーザー特定完了:", { coachId, seId, sfId });

type ScheduleRow = { schedule_id: string; target_sessions: number };
async function getSchedule(coachIdArg: string, studentIdArg: string): Promise<ScheduleRow> {
  const { data, error } = await admin.from("com_m_lesson_schedule").select("schedule_id, target_sessions").eq("coach_id", coachIdArg).eq("student_id", studentIdArg).eq("status", 1).single();
  if (error) throw error;
  return data as ScheduleRow;
}

// ===========================================================================
// 5. release_lesson_schedule_slot: コーチ交代 (生徒SE)
// ===========================================================================
console.log("\n--- 5. release_lesson_schedule_slot (生徒SE) ---");
const seSchedule = await getSchedule(coachId, seId);
const { count: seBeforeCount } = await admin.from("com_t_session").select("session_id", { count: "exact", head: true }).eq("schedule_id", seSchedule.schedule_id).eq("status", 1);
{
  const { error } = await adminClient.rpc("release_lesson_schedule_slot", { p_schedule_id: seSchedule.schedule_id });
  check("release_lesson_schedule_slot: コーチ交代操作が成功する", !error, error?.message);

  const { data: scheduleRow } = await admin.from("com_m_lesson_schedule").select("status").eq("schedule_id", seSchedule.schedule_id).single();
  check("release_lesson_schedule_slot: スケジュールが status=9(terminated) になる", scheduleRow?.status === 9, `status=${scheduleRow?.status}`);

  const { data: cancelledSessions } = await admin.from("com_t_session").select("status, cancel_category, ticket_refunded").eq("schedule_id", seSchedule.schedule_id).eq("cancel_category", 5);
  check(
    `release_lesson_schedule_slot: 未実施だった${seBeforeCount}件全てが status=3, cancel_category=5(coach_reassigned) になる`,
    (cancelledSessions ?? []).length === seBeforeCount && (cancelledSessions ?? []).every((s) => s.status === 3 && s.ticket_refunded === null),
    JSON.stringify(cancelledSessions)
  );
}

// ===========================================================================
// 6. invalidate_user_license: ライセンス無効化 (生徒SF)
// ===========================================================================
console.log("\n--- 6. invalidate_user_license (生徒SF) ---");
const sfSchedule = await getSchedule(coachId, sfId);
const { data: sfLicense } = await admin.from("com_t_user_license").select("license_id").eq("user_id", sfId).single();
const { count: sfBeforeCount } = await admin.from("com_t_session").select("session_id", { count: "exact", head: true }).eq("schedule_id", sfSchedule.schedule_id).eq("status", 1);
{
  const { error } = await adminClient.rpc("invalidate_user_license", { p_license_id: sfLicense!.license_id });
  check("invalidate_user_license: ライセンス無効化操作が成功する", !error, error?.message);

  const { data: licenseRow } = await admin.from("com_t_user_license").select("status").eq("license_id", sfLicense!.license_id).single();
  check("invalidate_user_license: ライセンスが status=0(停止) になる", licenseRow?.status === 0, `status=${licenseRow?.status}`);

  const { data: scheduleRow } = await admin.from("com_m_lesson_schedule").select("status").eq("schedule_id", sfSchedule.schedule_id).single();
  check("invalidate_user_license: 紐づくスケジュールが status=9(terminated) になる", scheduleRow?.status === 9, `status=${scheduleRow?.status}`);

  const { data: cancelledSessions } = await admin.from("com_t_session").select("status, cancel_category, ticket_refunded").eq("schedule_id", sfSchedule.schedule_id).eq("cancel_category", 4);
  check(
    `invalidate_user_license: 未実施だった${sfBeforeCount}件全てが status=3, cancel_category=4(license_ended) になる`,
    (cancelledSessions ?? []).length === sfBeforeCount && (cancelledSessions ?? []).every((s) => s.status === 3 && s.ticket_refunded === null),
    JSON.stringify(cancelledSessions)
  );
}

console.log("\n=== 検証結果(5-6節のみ) ===");
console.table(checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail ?? "" })));

writeResultLog({ scenario: "features/branches/feature-20260911-dev/session-lifecycle-refactor-retry-fncancelfuturesessions", env, tag: TAG, checks });

const failedChecks = checks.filter((c) => !c.ok);
if (failedChecks.length > 0) {
  console.error(`\nNG: ${failedChecks.length}件の不整合`);
  process.exit(1);
} else {
  console.log(`\nOK: 全${checks.length}件のチェックに合格`);
}
