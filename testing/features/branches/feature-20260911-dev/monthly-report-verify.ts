/**
 * monthly-report-seed.ts で投入したデータについて、
 * testing/features/branches/feature-20260911-dev/monthly-coaching-report.feature の
 * Then節に対応するチェックを行う。
 *
 * カウント規則・注意色判定・権限チェックは、実際にサインインした各ロールの実JWTで
 * 対象RPC(get_coach_monthly_sessions等)を呼び出して検証する(service_roleは使わない。
 * CLAUDE.md 6章 / testing/CONVENTIONS.md 3章)。承認/承認取消しもこのスクリプト内で実行し、
 * 最終的に「未承認」の状態に戻して終える(ユーザーがブラウザで承認操作を試せるようにするため)。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/monthly-report-verify.ts --env=dev --tag=mreport01
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { writeResultLog } from "../../../helpers/results.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;

const admin = await createAdminClient();

console.log(`\n=== 月次コーチングレポート検証: env=${env} tag=${TAG} ===`);

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function previousMonthDate(day: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day));
}
function toReportMonthString(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
const reportMonthPrev = toReportMonthString(previousMonthDate(1));
const reportMonthCurrent = toReportMonthString(new Date());

// ---------------------------------------------------------------------------
// seed.tsが投入したユーザーをclient_name経由で特定する
// ---------------------------------------------------------------------------
const { data: client } = await admin
  .from("com_m_client")
  .select("client_id")
  .eq("client_name", `【QAテスト】月次コーチングレポート検証（${TAG}）`)
  .single();
if (!client) throw new Error("対象クライアントが見つかりません。monthly-report-seed.tsを先に実行してください。");

const { data: users } = await admin.from("com_m_user").select("id, user_name, user_type").eq("client_id", client.client_id);
const coachUser = users?.find((u) => u.user_type === "2" && u.user_name?.includes("QAコーチ（月次レポート"));
const otherCoachUser = users?.find((u) => u.user_type === "2" && u.user_name?.includes("QA他コーチ（月次レポート"));
const studentUser = users?.find((u) => u.user_type === "1");
if (!coachUser || !otherCoachUser || !studentUser) throw new Error("対象ユーザーが揃っていません。monthly-report-seed.tsを先に実行してください。");

const coachId = coachUser.id as string;
const otherCoachId = otherCoachUser.id as string;
const studentId = studentUser.id as string;

const adminEmail = "qa-admin@gabby-qa-test.example";

const coachClient = await signInAsRole(`${TAG}-mreport-coach@gabby-qa-test.example`, PASSWORD);
const otherCoachClient = await signInAsRole(`${TAG}-mreport-coach-other@gabby-qa-test.example`, PASSWORD);
const adminClient = await signInAsRole(adminEmail, PASSWORD);
const { data: adminAuthUser } = await adminClient.auth.getUser();
const adminUserId = adminAuthUser.user?.id;
if (!adminUserId) throw new Error("QAアドミンのユーザーIDを特定できませんでした。");

console.log("対象ユーザー特定完了:", { coachId, otherCoachId, studentId, adminUserId, reportMonthPrev, reportMonthCurrent });

type SessionRow = {
  session_id: string;
  student_id: string;
  status: number;
  counts_toward_total: boolean;
  is_unresolved: boolean;
  is_attention: boolean;
};

// ---------------------------------------------------------------------------
// 1. 前月分: カウント規則・注意色クラスタ
// ---------------------------------------------------------------------------
{
  const { data, error } = await coachClient.rpc("get_coach_monthly_sessions", { p_coach_id: coachId, p_report_month: reportMonthPrev });
  check("前月分: get_coach_monthly_sessionsがコーチ自身のJWTで成功する", !error, error?.message);
  const sessions = (data ?? []) as SessionRow[];

  const clusterDaySessions = sessions.filter((s) => s.status === 2 || s.status === 6 || s.status === 7);
  check("前月分: 完了/No show/早期終了の3件が揃っている", clusterDaySessions.length === 3, `actual=${clusterDaySessions.length}`);
  check(
    "前月分: 3件すべてcounts_toward_total=true",
    clusterDaySessions.every((s) => s.counts_toward_total === true),
    JSON.stringify(clusterDaySessions.map((s) => ({ status: s.status, counts_toward_total: s.counts_toward_total })))
  );
  const attentionCount = clusterDaySessions.filter((s) => s.is_attention === true).length;
  check("前月分: No show・早期終了の2件がis_attention=true(完了は含まれない)", attentionCount === 2, `actual=${attentionCount}`);

  const unresolved = sessions.filter((s) => s.status === 1 && s.is_unresolved === true);
  check("前月分: 未処理セッションが1件、is_unresolved=trueかつcounts_toward_total=false", unresolved.length === 1 && unresolved[0]?.counts_toward_total === false, JSON.stringify(unresolved));
}

{
  const { data, error } = await coachClient.rpc("get_coach_monthly_active_students", { p_coach_id: coachId, p_report_month: reportMonthPrev });
  check("前月分: get_coach_monthly_active_studentsにQA生徒が含まれる", !error && (data ?? []).some((s: { student_id: string }) => s.student_id === studentId), error?.message ?? JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// 2. 当月分: 12時間以内キャンセル/コーチキャンセル/アドミン代理キャンセルの集計対象可否
// ---------------------------------------------------------------------------
{
  const { data, error } = await coachClient.rpc("get_coach_monthly_sessions", { p_coach_id: coachId, p_report_month: reportMonthCurrent });
  check("当月分: get_coach_monthly_sessionsが成功する", !error, error?.message);
  const sessions = (data ?? []) as SessionRow[];

  const cancelledByStudent = sessions.filter((s) => s.status === 3);
  check("当月分: 生徒都合キャンセル(12h以内)が1件、counts_toward_total=true・is_attention=true", cancelledByStudent.length === 1 && cancelledByStudent[0]?.counts_toward_total === true && cancelledByStudent[0]?.is_attention === true, JSON.stringify(cancelledByStudent));

  const cancelledByCoach = sessions.filter((s) => s.status === 4);
  check("当月分: コーチ都合キャンセルは実績・要対応のいずれでもないため一覧に含まれない", cancelledByCoach.length === 0, JSON.stringify(cancelledByCoach));

  const cancelledByAdmin = sessions.filter((s) => s.status === 10);
  check("当月分: アドミン代理キャンセルは実績・要対応のいずれでもないため一覧に含まれない", cancelledByAdmin.length === 0, JSON.stringify(cancelledByAdmin));

  const futureScheduled = sessions.filter((s) => s.status === 1);
  check("当月分: まだ実施されていない予定(status=scheduledかつ終了予定前)は一覧に含まれない", futureScheduled.length === 0, JSON.stringify(futureScheduled));
}

// ---------------------------------------------------------------------------
// 3. 権限チェック
// ---------------------------------------------------------------------------
{
  const { error } = await otherCoachClient.rpc("get_coach_monthly_sessions", { p_coach_id: coachId, p_report_month: reportMonthPrev });
  check("権限: 他コーチによる閲覧は not authorized で失敗する", !!error && error.message.includes("not authorized"), error?.message);
}
{
  const { error } = await coachClient.rpc("approve_coach_monthly_report", { p_coach_id: coachId, p_report_month: reportMonthPrev, p_approved_by: coachId });
  check("権限: コーチ本人による承認は not authorized で失敗する(承認は管理者専用)", !!error && error.message.includes("not authorized"), error?.message);
}

// ---------------------------------------------------------------------------
// 4. 終了処理未実施セッションによる承認ブロック（前月分は未処理セッションを含む）
// ---------------------------------------------------------------------------
{
  const { error } = await adminClient.rpc("approve_coach_monthly_report", { p_coach_id: coachId, p_report_month: reportMonthPrev, p_approved_by: adminUserId });
  check(
    "承認ブロック: 未処理セッションが残る月はunresolved sessionエラーで承認できない",
    !!error && error.message.includes("unresolved session"),
    error?.message
  );
}
{
  const { data } = await admin
    .from("com_t_coach_monthly_report_approval")
    .select("status")
    .eq("coach_id", coachId)
    .eq("report_month", reportMonthPrev)
    .maybeSingle();
  check("承認ブロック: 承認試行が拒否された結果、承認レコードは作成されない(またはstatus=1のまま)", !data || data.status === 1, JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// 5. 承認・承認取消し（当月分は未処理セッションを含まないため正常に承認できる）
// ---------------------------------------------------------------------------
{
  const { error } = await adminClient.rpc("approve_coach_monthly_report", { p_coach_id: coachId, p_report_month: reportMonthCurrent, p_approved_by: adminUserId });
  check("承認: 未処理セッションが無い月はアドミンJWTでapprove_coach_monthly_reportが成功する", !error, error?.message);
}
{
  const { data } = await admin
    .from("com_t_coach_monthly_report_approval")
    .select("*")
    .eq("coach_id", coachId)
    .eq("report_month", reportMonthCurrent)
    .single();
  check("承認: statusが承認済み(2)になっている", data?.status === 2, `status=${data?.status}`);
  check("承認: session_count_snapshotが保存されている", !!data?.session_count_snapshot?.total || data?.session_count_snapshot?.total === 0, JSON.stringify(data?.session_count_snapshot));
  check("承認: approved_by/approved_atが設定されている", data?.approved_by === adminUserId && !!data?.approved_at, JSON.stringify({ approved_by: data?.approved_by, approved_at: data?.approved_at }));
  check(
    "承認: rate_amount/rate_currencyが単価マスタの値でスナップショットされている",
    typeof data?.rate_amount === "number" && data.rate_amount > 0 && typeof data?.rate_currency === "string" && data.rate_currency.length > 0,
    JSON.stringify({ rate_amount: data?.rate_amount, rate_currency: data?.rate_currency })
  );

  const { data: notifications } = await admin.from("com_t_notification").select("*").eq("user_id", coachId).eq("notification_type", "COACH_REPORT_APPROVED");
  check("承認: コーチへCOACH_REPORT_APPROVED通知が届いている", (notifications?.length ?? 0) >= 1, `count=${notifications?.length ?? 0}`);
}
{
  const { error } = await adminClient.rpc("revoke_coach_monthly_report_approval", { p_coach_id: coachId, p_report_month: reportMonthCurrent });
  check("承認取消し: アドミンJWTでrevoke_coach_monthly_report_approvalが成功する", !error, error?.message);
}
{
  const { data } = await admin
    .from("com_t_coach_monthly_report_approval")
    .select("*")
    .eq("coach_id", coachId)
    .eq("report_month", reportMonthCurrent)
    .single();
  check("承認取消し: statusが未承認(1)に戻っている", data?.status === 1, `status=${data?.status}`);
  check(
    "承認取消し: session_count_snapshot/rate_amount/rate_currency/approved_by/approved_atがNULLに戻っている",
    data?.session_count_snapshot === null &&
      data?.rate_amount === null &&
      data?.rate_currency === null &&
      data?.approved_by === null &&
      data?.approved_at === null,
    JSON.stringify({
      snapshot: data?.session_count_snapshot,
      rate_amount: data?.rate_amount,
      rate_currency: data?.rate_currency,
      approved_by: data?.approved_by,
      approved_at: data?.approved_at,
    })
  );

  const { data: notifications } = await admin.from("com_t_notification").select("*").eq("user_id", coachId).eq("notification_type", "COACH_REPORT_APPROVAL_REVOKED");
  check("承認取消し: コーチへCOACH_REPORT_APPROVAL_REVOKED通知が届いている", (notifications?.length ?? 0) >= 1, `count=${notifications?.length ?? 0}`);
}
{
  const { error } = await adminClient.rpc("revoke_coach_monthly_report_approval", { p_coach_id: coachId, p_report_month: reportMonthCurrent });
  check("承認取消し: 既に未承認の状態で再度取消しを呼ぶと失敗する", !!error && error.message.includes("not approved"), error?.message);
}

console.log("\n=== 検証結果 ===");
console.table(checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail ?? "" })));

await coachClient.auth.signOut();
await otherCoachClient.auth.signOut();
await adminClient.auth.signOut();

const log = writeResultLog({
  scenario: "features/branches/feature-20260911-dev/monthly-coaching-report.feature",
  env,
  tag: TAG,
  checks,
});

console.log(
  `\n最終状態: 前月分(${reportMonthPrev})は未処理セッションが残るため未承認のまま、当月分(${reportMonthCurrent})も未承認に戻した状態で終了しています。ブラウザで承認操作をお試しいただけます（前月分は承認ブロックの確認、当月分は正常な承認/取消しの確認に使えます）。`
);

if (!log.ok) {
  console.error(`\nNG: ${log.failed}件の不整合`);
  process.exit(1);
} else {
  console.log(`\nOK: 全${log.totalChecks}件のチェックに合格`);
}
