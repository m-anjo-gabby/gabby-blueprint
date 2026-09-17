/**
 * training-report-comment-seed.ts で投入したデータに対し、com_t_contract_training_report の
 * RLSポリシー・業務ロジック（coachStudentActions.tsのgetContractTrainingReportsCore /
 * saveContractTrainingReportDraftCore / finalizeContractTrainingReportCore相当）を、
 * 実際にサインインしたコーチのJWTクライアントで直接テーブル操作して検証する。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/training-report-comment-verify.ts --env=dev --tag=trainingreport01
 *
 * 事前にtraining-report-comment-seed.tsを同じ--tagで実行しておくこと。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../../helpers/auth.ts";
import { writeResultLog, type CheckResult } from "../../../helpers/results.ts";
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
const checks: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` — ${detail}` : ""}`);
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

async function findTicketId(userId: string, noteContains: string): Promise<string> {
  const { data: contracts, error } = await admin.from("com_m_contract").select("contract_id, note").ilike("note", `%${noteContains}%`);
  if (error) throw error;
  if (!contracts || contracts.length === 0) throw new Error(`契約が見つかりません: note like ${noteContains}`);
  const contractIds = contracts.map((c) => c.contract_id as string);
  const { data: tickets, error: tErr } = await admin.from("com_t_user_session_ticket").select("ticket_id, contract_id").eq("user_id", userId).in("contract_id", contractIds);
  if (tErr) throw tErr;
  if (!tickets || tickets.length === 0) throw new Error(`チケットが見つかりません: userId=${userId}, note like ${noteContains}`);
  return tickets[0].ticket_id as string;
}

console.log(`\n=== Training Report コーチコメント②シナリオ検証: env=${env} tag=${TAG} ===`);

const coachAEmail = `${TAG}-tr-coach-a@gabby-qa-test.example`;
const coachBEmail = `${TAG}-tr-coach-b@gabby-qa-test.example`;
const coachOutsiderEmail = `${TAG}-tr-coach-outsider@gabby-qa-test.example`;

const coachAId = await findAuthUserByEmail(coachAEmail);
const coachBId = await findAuthUserByEmail(coachBEmail);
const coachOutsiderId = await findAuthUserByEmail(coachOutsiderEmail);
const studentAId = await findAuthUserByEmail(`${TAG}-tr-student-a@gabby-qa-test.example`);
const studentBId = await findAuthUserByEmail(`${TAG}-tr-student-b@gabby-qa-test.example`);
const studentDId = await findAuthUserByEmail(`${TAG}-tr-student-d@gabby-qa-test.example`);
const studentEId = await findAuthUserByEmail(`${TAG}-tr-student-e@gabby-qa-test.example`);
if (!coachAId || !coachBId || !coachOutsiderId || !studentAId || !studentBId || !studentDId || !studentEId) {
  throw new Error("必要なQAユーザーが見つかりません。先にtraining-report-comment-seed.tsを実行してください。");
}

const aTicketId = await findTicketId(studentAId, "生徒A");
const bCurTicketId = await findTicketId(studentBId, "生徒B現在契約");
const b25moTicketId = await findTicketId(studentBId, "生徒B 25か月前契約");
const dTicketId = await findTicketId(studentDId, "生徒D");
const eTicketId = await findTicketId(studentEId, "生徒E");

const coachA: SupabaseClient = await signInAsRole(coachAEmail, PASSWORD);
const coachB: SupabaseClient = await signInAsRole(coachBEmail, PASSWORD);
const coachOutsider: SupabaseClient = await signInAsRole(coachOutsiderEmail, PASSWORD);

const SELECT_COLS = "report_id, ticket_id, student_id, coach_id, comment_text, status, finalized_at";

// ---------------------------------------------------------------------------
// シナリオ1: 生徒A（新規契約、レポート未作成） — 基本の一時保存→確定フロー
// ---------------------------------------------------------------------------
console.log("\n--- シナリオ1: 生徒A 一時保存→確定 ---");

let aReportId: string;
{
  const { data, error } = await coachA
    .from("com_t_contract_training_report")
    .insert({ ticket_id: aTicketId, student_id: studentAId, coach_id: coachAId, comment_text: "初回ドラフト: 発音の基礎を中心に取り組み中。" })
    .select(SELECT_COLS)
    .single();
  record("1-1. コーチAが生徒Aの新規ドラフトを作成できる", !error && !!data && data.status === 1, error?.message);
  aReportId = data?.report_id as string;
}

{
  const { data, error } = await coachA.from("com_t_contract_training_report").select(SELECT_COLS).eq("report_id", aReportId).maybeSingle();
  record("1-2. コーチAが自分のドラフトを取得できる", !error && !!data, error?.message);
}

{
  const { data, error } = await coachA
    .from("com_t_contract_training_report")
    .update({ comment_text: "更新版ドラフト: 発音・語彙ともに改善傾向。次期契約でも継続を推奨。" })
    .eq("report_id", aReportId)
    .select(SELECT_COLS)
    .maybeSingle();
  record("1-3. コーチAがdraft状態のコメントを編集できる", !error && !!data && data.comment_text.includes("改善傾向"), error?.message);
}

{
  const { data, error } = await coachA
    .from("com_t_contract_training_report")
    .update({ status: 2, finalized_at: new Date().toISOString() })
    .eq("report_id", aReportId)
    .select(SELECT_COLS)
    .maybeSingle();
  record("1-4. コーチAがレポートを確定(finalized)できる", !error && !!data && data.status === 2, error?.message);
}

{
  const { data, error } = await coachA
    .from("com_t_contract_training_report")
    .update({ comment_text: "確定後に編集しようとする不正な更新" })
    .eq("report_id", aReportId)
    .select(SELECT_COLS)
    .maybeSingle();
  record("1-5. 確定後はコーチA自身でも編集できない(RLSで0件更新)", !error && !data, error?.message ?? "更新が想定通り0件でブロックされた");
}

{
  const { data, error } = await coachOutsider.from("com_t_contract_training_report").select(SELECT_COLS).eq("report_id", aReportId).maybeSingle();
  record("1-6. 無関係コーチは生徒Aの確定済みレポートを参照できない", !error && !data, error?.message ?? "RLSにより0件");
}

{
  const { error } = await coachOutsider
    .from("com_t_contract_training_report")
    .insert({ ticket_id: aTicketId, student_id: studentAId, coach_id: coachOutsiderId, comment_text: "無関係コーチによる不正な新規作成" });
  record("1-7. 無関係コーチは生徒Aに新規ドラフトを作成できない(RLS INSERT拒否)", !!error, error ? error.message : "想定外に成功してしまった");
}

// ---------------------------------------------------------------------------
// シナリオ2: 生徒B（現在契約 + 過去契約3件） — 表示ウィンドウの前提となる日付境界の確認
// ---------------------------------------------------------------------------
console.log("\n--- シナリオ2: 生徒B 直近1年/2年の境界 ---");

{
  const { data: contracts, error } = await admin
    .from("com_t_user_session_ticket")
    .select("ticket_id, com_t_user_license!inner(start_date,end_date)")
    .eq("user_id", studentBId);
  if (error) throw error;
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  type Row = { ticket_id: string; com_t_user_license: { start_date: string; end_date: string } };
  const rows = (contracts ?? []) as unknown as Row[];
  const within1yr = rows.filter((r) => new Date(r.com_t_user_license.start_date) >= oneYearAgo);
  const outside1yr = rows.filter((r) => new Date(r.com_t_user_license.start_date) < oneYearAgo);
  record(
    "2-1. 生徒Bの契約4件中、直近1年以内は現在契約+8か月前の2件になっている",
    rows.length === 4 && within1yr.length === 2 && outside1yr.length === 2,
    `total=${rows.length}, within1yr=${within1yr.length}, outside1yr=${outside1yr.length}`
  );
}

{
  const { data, error } = await coachA
    .from("com_t_contract_training_report")
    .insert({ ticket_id: bCurTicketId, student_id: studentBId, coach_id: coachAId, comment_text: "現在契約のコメント" })
    .select(SELECT_COLS)
    .single();
  record("2-2. コーチAが生徒Bの現在契約にドラフトを作成できる", !error && !!data, error?.message);
  if (data) {
    const { error: finErr } = await coachA.from("com_t_contract_training_report").update({ status: 2, finalized_at: new Date().toISOString() }).eq("report_id", data.report_id);
    record("2-3. 上記を確定できる", !finErr, finErr?.message);
  }
}

{
  // 直近1年ウィンドウ外(25か月前)の契約でも、現役の担当関係がある限り新規にレポートを作成・確定できる
  // ことを確認する(Training Reportsカードには出ないが、training-reports一覧ページからは操作可能な想定)。
  const { data, error } = await coachA
    .from("com_t_contract_training_report")
    .insert({ ticket_id: b25moTicketId, student_id: studentBId, coach_id: coachAId, comment_text: "25か月前の契約についての振り返りコメント" })
    .select(SELECT_COLS)
    .single();
  record("2-4. コーチAが2年超前の契約にも新規レポートを作成できる(現役の担当関係があるため)", !error && !!data, error?.message);
  if (data) {
    const { error: finErr } = await coachA.from("com_t_contract_training_report").update({ status: 2, finalized_at: new Date().toISOString() }).eq("report_id", data.report_id);
    record("2-5. 上記を確定できる", !finErr, finErr?.message);
  }
}

{
  const { data, error } = await coachA.from("com_t_contract_training_report").select(SELECT_COLS).eq("student_id", studentBId);
  record("2-6. コーチAから見える生徒Bのレポートが2件(現在契約+25か月前)になっている", !error && (data?.length ?? 0) === 2, `件数=${data?.length}`);
}

// ---------------------------------------------------------------------------
// シナリオ3: 生徒D（週2回契約をコーチA/コーチBで分担） — ドラフト非公開・確定後の相互参照
// ---------------------------------------------------------------------------
console.log("\n--- シナリオ3: 生徒D コーチ分担 ---");

let dReportAId: string;
let dReportBId: string;
{
  const { data, error } = await coachA
    .from("com_t_contract_training_report")
    .insert({ ticket_id: dTicketId, student_id: studentDId, coach_id: coachAId, comment_text: "コーチA担当分のドラフト" })
    .select(SELECT_COLS)
    .single();
  record("3-1. コーチAが生徒Dにドラフトを作成できる", !error && !!data, error?.message);
  dReportAId = data?.report_id as string;
}

{
  const { data, error } = await coachB.from("com_t_contract_training_report").select(SELECT_COLS).eq("ticket_id", dTicketId);
  const seesCoachADraft = (data ?? []).some((r) => r.report_id === dReportAId);
  record("3-2. コーチBはコーチAのドラフト(未確定)を参照できない", !error && !seesCoachADraft, `取得件数=${data?.length}`);
}

{
  const { data, error } = await coachB
    .from("com_t_contract_training_report")
    .insert({ ticket_id: dTicketId, student_id: studentDId, coach_id: coachBId, comment_text: "コーチB担当分のドラフト" })
    .select(SELECT_COLS)
    .single();
  record("3-3. コーチBも同じticketに自分のドラフトを作成できる(UNIQUE(ticket_id,coach_id))", !error && !!data, error?.message);
  dReportBId = data?.report_id as string;
}

{
  const { data, error } = await coachA.from("com_t_contract_training_report").select(SELECT_COLS).eq("ticket_id", dTicketId);
  const seesCoachBDraft = (data ?? []).some((r) => r.report_id === dReportBId);
  record("3-4. コーチAはコーチBのドラフト(未確定)を参照できない", !error && !seesCoachBDraft, `取得件数=${data?.length}`);
}

{
  const { data, error } = await coachB.from("com_t_contract_training_report").update({ status: 2, finalized_at: new Date().toISOString() }).eq("report_id", dReportBId).select(SELECT_COLS).maybeSingle();
  record("3-5. コーチBが自分のレポートを確定できる", !error && !!data && data.status === 2, error?.message);
}

{
  const { data, error } = await coachA.from("com_t_contract_training_report").select(SELECT_COLS).eq("report_id", dReportBId).maybeSingle();
  record("3-6. コーチBが確定した後は、コーチAから参照できる", !error && !!data, error?.message);
}

{
  const { data, error } = await coachA
    .from("com_t_contract_training_report")
    .update({ comment_text: "コーチAによる不正な書き換え" })
    .eq("report_id", dReportBId)
    .select(SELECT_COLS)
    .maybeSingle();
  record("3-7. コーチAはコーチBの確定済みレポートを編集できない", !error && !data, error?.message ?? "想定通り0件");
}

{
  const { data, error } = await coachA.from("com_t_contract_training_report").update({ status: 2, finalized_at: new Date().toISOString() }).eq("report_id", dReportAId).select(SELECT_COLS).maybeSingle();
  record("3-8. コーチAも自分のレポートを確定できる", !error && !!data && data.status === 2, error?.message);
}

// ---------------------------------------------------------------------------
// シナリオ4: 生徒E（担当解消済み・is_active=false） — 現役コーチのみ編集可の否定系確認
// ---------------------------------------------------------------------------
console.log("\n--- シナリオ4: 生徒E 担当解消済み ---");

{
  const { data, error } = await admin.from("com_m_coach_student_relationship").select("is_active").eq("coach_id", coachAId).eq("student_id", studentEId).maybeSingle();
  record("4-1. (前提確認) コーチA⇔生徒Eの担当関係がis_active=falseになっている", !error && data?.is_active === false, `is_active=${data?.is_active}`);
}

{
  const { error } = await coachA
    .from("com_t_contract_training_report")
    .insert({ ticket_id: eTicketId, student_id: studentEId, coach_id: coachAId, comment_text: "担当解消後の不正な新規作成" });
  record("4-2. 現役の担当関係が無いコーチは新規ドラフトを作成できない(RLS INSERT拒否)", !!error, error ? error.message : "想定外に成功してしまった");
}

// ---------------------------------------------------------------------------
await coachA.auth.signOut();
await coachB.auth.signOut();
await coachOutsider.auth.signOut();

const log = writeResultLog({ scenario: "training-report-comment", env, tag: TAG, checks });
console.log(`\n=== 検証完了: ${log.passed}/${log.totalChecks} OK ===`);
if (!log.ok) {
  console.log("NGの項目があります。上記ログを確認してください。");
  process.exitCode = 1;
}
