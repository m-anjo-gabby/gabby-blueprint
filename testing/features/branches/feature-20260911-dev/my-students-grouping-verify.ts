/**
 * my-students-grouping-seed.ts で投入したデータについて、
 * testing/features/branches/feature-20260911-dev/coach-my-students-grouping.feature の
 * Then節に対応するチェックを行う。
 *
 * getAssignedStudentsCore(packages/lib/coachStudent/actions/coachStudentActions.ts)は
 * next/headersのcookies()に依存するNextサーバーアクション実装のため、本スクリプトのような
 * Node単体プロセスから直接呼び出すことができない。そのため本スクリプトでは、その内部で
 * 発行しているクエリと同一のクエリ（com_m_coach_student_relationship / com_t_user_license
 * +com_m_contract）をコーチ本人の実JWTで再現し、is_active/直近契約(latest_contract)の
 * 導出結果が期待通りになることを検証する（RLSが正しく機能していることも合わせて確認する）。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/my-students-grouping-verify.ts --env=dev --tag=mystudents01
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

console.log(`\n=== My Studentsグルーピング検証: env=${env} tag=${TAG} ===`);

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

// ---------------------------------------------------------------------------
// seed.tsが投入したユーザーをclient_name経由で特定する
// ---------------------------------------------------------------------------
const { data: client } = await admin
  .from("com_m_client")
  .select("client_id")
  .eq("client_name", `【QAテスト】My Studentsグルーピング検証（${TAG}）`)
  .single();
if (!client) throw new Error("対象クライアントが見つかりません。my-students-grouping-seed.tsを先に実行してください。");

const { data: users } = await admin.from("com_m_user").select("id, user_name, user_type").eq("client_id", client.client_id);
const coachUser = users?.find((u) => u.user_type === "2");
const studentAUser = users?.find((u) => u.user_name?.includes("QA生徒A（My Students"));
const studentBUser = users?.find((u) => u.user_name?.includes("QA生徒B（My Students"));
const studentCUser = users?.find((u) => u.user_name?.includes("QA生徒C（My Students"));
if (!coachUser || !studentAUser || !studentBUser || !studentCUser) {
  throw new Error("対象ユーザーが揃っていません。my-students-grouping-seed.tsを先に実行してください。");
}

const coachId = coachUser.id as string;
const studentAId = studentAUser.id as string;
const studentBId = studentBUser.id as string;
const studentCId = studentCUser.id as string;
const studentIds = [studentAId, studentBId, studentCId];

const coachClient = await signInAsRole(`${TAG}-mystudents-coach@gabby-qa-test.example`, PASSWORD);

console.log("対象ユーザー特定完了:", { coachId, studentAId, studentBId, studentCId });

// ---------------------------------------------------------------------------
// 0. 生徒Cのライセンス/スケジュールがseed.ts側のinvalidate_user_licenseで
//    意図通り status=0 / 9 に遷移しているかの前提確認（service_roleで直接確認）
// ---------------------------------------------------------------------------
{
  const { data: cLicense } = await admin.from("com_t_user_license").select("status").eq("user_id", studentCId).single();
  check("前提: 生徒Cのライセンスがstatus=0(停止)になっている", cLicense?.status === 0, `status=${cLicense?.status}`);

  const { data: cSchedules } = await admin.from("com_m_lesson_schedule").select("status").eq("coach_id", coachId).eq("student_id", studentCId);
  const allTerminated = (cSchedules ?? []).length > 0 && (cSchedules ?? []).every((s) => s.status === 9);
  check("前提: 生徒Cの紐づくscheduleが全てstatus=9(terminated)になっている", allTerminated, JSON.stringify(cSchedules));
}

// ---------------------------------------------------------------------------
// 1. com_m_coach_student_relationship: is_active（コーチ自身の実JWT・RLS配下）
// ---------------------------------------------------------------------------
type RelationshipRow = { student_id: string; is_active: boolean };
let relationships: RelationshipRow[] = [];
{
  const { data, error } = await coachClient
    .from("com_m_coach_student_relationship")
    .select("student_id, is_active")
    .eq("coach_id", coachId)
    .in("student_id", studentIds);
  check("relationship: コーチ自身のJWTで3名分の担当関係を参照できる", !error && (data ?? []).length === 3, error?.message ?? JSON.stringify(data));
  relationships = (data ?? []) as RelationshipRow[];
}
const isActiveByStudent = new Map(relationships.map((r) => [r.student_id, r.is_active]));

check("relationship: 生徒A(単純な現役契約)はis_active=true", isActiveByStudent.get(studentAId) === true, `actual=${isActiveByStudent.get(studentAId)}`);
check("relationship: 生徒B(旧契約終了+新契約稼働中)はis_active=true", isActiveByStudent.get(studentBId) === true, `actual=${isActiveByStudent.get(studentBId)}`);
check(
  "relationship: 生徒C(invalidate_user_licenseで解除済み)はis_active=falseに自動的に切り替わっている",
  isActiveByStudent.get(studentCId) === false,
  `actual=${isActiveByStudent.get(studentCId)}`
);

// ---------------------------------------------------------------------------
// 2. com_t_user_license + com_m_contract: 直近の契約(latest_contract)の導出
//    getLatestContractsByStudentIds(coachStudentActions.ts)と同一のロジックを、
//    コーチ自身の実JWTで取得した生データに対して再現する。
// ---------------------------------------------------------------------------
type ContractJoinRow = { plan_name: string; plan_name_en: string } | { plan_name: string; plan_name_en: string }[] | null;
type LicenseRow = { user_id: string; start_date: string; end_date: string; status: number; com_m_contract: ContractJoinRow };

let licenses: LicenseRow[] = [];
{
  const { data, error } = await coachClient
    .from("com_t_user_license")
    .select("user_id, start_date, end_date, status, com_m_contract(plan_name, plan_name_en)")
    .in("user_id", studentIds);
  check("license: コーチ自身のJWTでライセンス一覧を参照できる(生徒A:1件, 生徒B:2件, 生徒C:1件=計4件)", !error && (data ?? []).length === 4, error?.message ?? JSON.stringify(data));
  licenses = (data ?? []) as unknown as LicenseRow[];
}

const nowIso = new Date().toISOString();
type LatestContract = { plan_name_en: string; start_date: string; end_date: string; is_current: boolean };
const latestByStudent = new Map<string, LatestContract & { _end: string }>();
for (const license of licenses) {
  const contractJoin = license.com_m_contract;
  const contract = Array.isArray(contractJoin) ? contractJoin[0] : contractJoin;
  if (!contract) continue;
  const current = latestByStudent.get(license.user_id);
  if (current && current._end >= license.end_date) continue;
  latestByStudent.set(license.user_id, {
    plan_name_en: contract.plan_name_en,
    start_date: license.start_date,
    end_date: license.end_date,
    is_current: license.status === 1 && license.start_date <= nowIso && nowIso <= license.end_date,
    _end: license.end_date,
  });
}

const latestA = latestByStudent.get(studentAId);
check("latest_contract: 生徒Aの最新契約はプラン'Standard'", latestA?.plan_name_en === "Standard", JSON.stringify(latestA));
check("latest_contract: 生徒Aの最新契約はis_current=true", latestA?.is_current === true, JSON.stringify(latestA));

const latestB = latestByStudent.get(studentBId);
check(
  "latest_contract: 生徒Bの最新契約は終了日がより新しい新契約(プラン'Business Pro (Dialogue)')が選ばれる(旧契約'Standard'は選ばれない)",
  latestB?.plan_name_en === "Business Pro (Dialogue)",
  JSON.stringify(latestB)
);
check("latest_contract: 生徒Bの最新契約(新契約)はis_current=true", latestB?.is_current === true, JSON.stringify(latestB));

const latestC = latestByStudent.get(studentCId);
check(
  "latest_contract: 生徒Cの最新契約はis_current=false(契約期間(end_date)は未来でもstatus=0のため現役扱いにならない)",
  latestC?.is_current === false,
  JSON.stringify(latestC)
);
check("latest_contract: 生徒Cの契約期間(end_date)自体はまだ現在日時より先である(期間切れによる終了ではないことの確認)", !!latestC && latestC.end_date > nowIso, JSON.stringify(latestC));

// ---------------------------------------------------------------------------
// 3. My Studentsのグルーピング分類（StudentListView.tsxがis_activeで振り分ける前提の確認）
// ---------------------------------------------------------------------------
const activeGroup = studentIds.filter((id) => isActiveByStudent.get(id) === true);
const pastGroup = studentIds.filter((id) => isActiveByStudent.get(id) === false);
check(
  "グルーピング: アクティブ生徒グループ=[生徒A, 生徒B]、過去生徒グループ=[生徒C]",
  activeGroup.length === 2 && activeGroup.includes(studentAId) && activeGroup.includes(studentBId) && pastGroup.length === 1 && pastGroup.includes(studentCId),
  JSON.stringify({ activeGroup, pastGroup })
);

console.log("\n=== 検証結果 ===");
console.table(checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail ?? "" })));

await coachClient.auth.signOut();

const log = writeResultLog({
  scenario: "features/branches/feature-20260911-dev/coach-my-students-grouping.feature",
  env,
  tag: TAG,
  checks,
});

console.log(
  `\n最終状態: 生徒A・Bはアクティブ生徒(現役契約あり)、生徒Cは過去生徒(契約解除済み)のまま残しています。` +
    `\nブラウザ確認: コーチアカウント ${TAG}-mystudents-coach@gabby-qa-test.example でサインインし、` +
    `/students でActive Students(生徒A・B)とPast Students(生徒C)のセクション分割・各カードの契約バッジ表示をご確認ください。` +
    `\nパスワードはQA_LIVE_SESSION_TEST_PASSWORDと同じ共通パスワードです。`
);

if (!log.ok) {
  console.error(`\nNG: ${log.failed}件の不整合`);
  process.exit(1);
} else {
  console.log(`\nOK: 全${log.totalChecks}件のチェックに合格`);
}
