/**
 * Training Reportカード（契約単位トレーニングレポート・コーチコメント, com_t_contract_training_report）の
 * データ主体テスト(②)を dev/staging環境に投入するスクリプト。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/training-report-comment-seed.ts --env=dev --tag=trainingreport01
 *
 * 本機能は新規RPCを持たない（com_t_contract_training_reportへの直接INSERT/UPDATE+RLSのみ）ため、
 * preflightでのRPC存在確認は対象外。ただし対象テーブル・RLSポリシー自体がdev環境に反映されている
 * ことは前提とする（適用済みであることをユーザーから確認済み）。
 *
 * ユーザーの指示により、テスト完了後もデータは削除しない（ブラウザでの目視確認用に残す）。
 *
 * 投入する生徒パターン:
 *   - 生徒A: 新規契約1件のみ、レポート未作成（一時保存→確定の基本フローを確認する）
 *   - 生徒B: 現在契約1件 + 過去契約3件（8か月前・14か月前・25か月前終了）。
 *            Training Reportsカード(直近1年)とtraining-reports一覧ページ(全件)の
 *            表示範囲の違いを確認する。
 *   - 生徒D: 週2回契約をコーチA/コーチBで分担（slot_no 1/2）。分担コーチ間での
 *            ドラフト非公開・確定後の相互参照を確認する。
 *   - 生徒E: 過去に担当was解消済み(is_active=false)。現役の担当関係が無いコーチによる
 *            新規ドラフト作成がRLSで拒否されることを確認する（否定系）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";
import { addDays } from "../../../helpers/dates.ts";

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

console.log(`\n=== Training Report コーチコメント②シナリオ投入: env=${env} tag=${TAG} ===`);

// ---------------------------------------------------------------------------
// 共通ヘルパー（my-students-grouping-seed.ts と同型）
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

/** status=1(active)/9(terminated)を指定してスケジュールを直接投入する。sync_coach_student_relationship
 * トリガーが反応し、com_m_coach_student_relationship.is_activeが自動的に再計算される。
 * target_sessionsはcom_m_lesson_schedule.sqlの2026-09-14パッチと同じ端数配分ルール
 * (total_sessions/weekly_frequencyの均等割り、余りはslot_no昇順に配分)で計算する。 */
async function seedSchedule(params: { ticketId: string; studentId: string; coachId: string; slotNo: number; status: 1 | 9; startDate: Date; endDate: Date; plan: Plan }): Promise<string> {
  const weeklyFrequency = params.plan.weekly_frequency ?? 1;
  const totalSessions = params.plan.total_sessions ?? 0;
  const targetSessions = Math.floor(totalSessions / weeklyFrequency) + (params.slotNo <= totalSessions % weeklyFrequency ? 1 : 0);

  const { data, error } = await admin
    .from("com_m_lesson_schedule")
    .insert({
      ticket_id: params.ticketId,
      student_id: params.studentId,
      coach_id: params.coachId,
      slot_no: params.slotNo,
      target_sessions: targetSessions,
      day_of_week: params.startDate.getUTCDay(),
      start_time: "10:00:00",
      end_time: "10:30:00",
      coach_timezone: "Asia/Tokyo",
      status: params.status,
      start_date: params.startDate.toISOString().slice(0, 10),
      end_date: params.endDate.toISOString().slice(0, 10),
    })
    .select("schedule_id")
    .single();
  if (error) throw error;
  return data.schedule_id as string;
}

// ---------------------------------------------------------------------------
// 共通セットアップ: 顧客・コーチ・アドミン
// ---------------------------------------------------------------------------
const clientId = await ensureClient(`【QAテスト】Training Reportコーチコメント検証（${TAG}）`);
const coachAId = await ensureUser(`${TAG}-tr-coach-a@gabby-qa-test.example`, "2", `QAコーチA（TrainingReport・${TAG}）`, clientId);
const coachBId = await ensureUser(`${TAG}-tr-coach-b@gabby-qa-test.example`, "2", `QAコーチB（TrainingReport・分担・${TAG}）`, clientId);
const coachOutsiderId = await ensureUser(`${TAG}-tr-coach-outsider@gabby-qa-test.example`, "2", `QAコーチ（無関係・${TAG}）`, clientId);
const studentAId = await ensureUser(`${TAG}-tr-student-a@gabby-qa-test.example`, "1", `QA生徒A（新規契約・${TAG}）`, clientId);
const studentBId = await ensureUser(`${TAG}-tr-student-b@gabby-qa-test.example`, "1", `QA生徒B（過去契約複数・${TAG}）`, clientId);
const studentDId = await ensureUser(`${TAG}-tr-student-d@gabby-qa-test.example`, "1", `QA生徒D（コーチ分担・${TAG}）`, clientId);
const studentEId = await ensureUser(`${TAG}-tr-student-e@gabby-qa-test.example`, "1", `QA生徒E（担当解消済み・${TAG}）`, clientId);

const adminEmail = "qa-admin@gabby-qa-test.example";
let adminUserId = await findAuthUserByEmail(adminEmail);
if (!adminUserId) {
  adminUserId = await ensureUser(adminEmail, "0", "QAアドミン（代理操作用）", null);
} else {
  await admin.from("com_m_user").update({ user_type: "0" }).eq("id", adminUserId);
}

console.log("共通セットアップ完了:", { clientId, coachAId, coachBId, coachOutsiderId, studentAId, studentBId, studentDId, studentEId, adminUserId });

const STANDARD = await getPlan("LIVE_WEEKLY1_3M");
const BUSINESS_PRO = await getPlan("LIVE_WEEKLY2_3M");

// ---------------------------------------------------------------------------
// 生徒A: 新規契約1件のみ、レポート未作成
// ---------------------------------------------------------------------------
console.log("\n--- 生徒A: 新規契約のみ ---");
const aStart = addDays(TODAY, -10);
const aEnd = addDays(TODAY, 80);
const { ticketId: aTicketId } = await createContractLicenseTicket({
  clientId,
  userId: studentAId,
  plan: STANDARD,
  startDate: aStart,
  endDate: aEnd,
  note: `QA自動テスト(feature-20260911-dev TrainingReport, tag=${TAG}) 生徒A`,
});
await seedSchedule({ ticketId: aTicketId, studentId: studentAId, coachId: coachAId, slotNo: 1, status: 1, startDate: aStart, endDate: aEnd, plan: STANDARD });
console.log("生徒A投入完了:", { aTicketId });

// ---------------------------------------------------------------------------
// 生徒B: 現在契約1件 + 過去契約3件(8か月前/14か月前/25か月前終了)
// ---------------------------------------------------------------------------
console.log("\n--- 生徒B: 現在契約 + 過去契約3件 ---");
const bCurStart = addDays(TODAY, -20);
const bCurEnd = addDays(TODAY, 70);
const { ticketId: bCurTicketId } = await createContractLicenseTicket({
  clientId,
  userId: studentBId,
  plan: STANDARD,
  startDate: bCurStart,
  endDate: bCurEnd,
  note: `QA自動テスト(feature-20260911-dev TrainingReport, tag=${TAG}) 生徒B現在契約`,
});
await seedSchedule({ ticketId: bCurTicketId, studentId: studentBId, coachId: coachAId, slotNo: 1, status: 1, startDate: bCurStart, endDate: bCurEnd, plan: STANDARD });

// 8か月前終了(約240日前) — Training Reportsカードの直近1年ウィンドウに含まれる想定
const b8moEnd = addDays(TODAY, -240);
const b8moStart = addDays(b8moEnd, -90);
const { ticketId: b8moTicketId } = await createContractLicenseTicket({
  clientId,
  userId: studentBId,
  plan: STANDARD,
  startDate: b8moStart,
  endDate: b8moEnd,
  note: `QA自動テスト(feature-20260911-dev TrainingReport, tag=${TAG}) 生徒B 8か月前契約`,
});
await seedSchedule({ ticketId: b8moTicketId, studentId: studentBId, coachId: coachAId, slotNo: 1, status: 9, startDate: b8moStart, endDate: b8moEnd, plan: STANDARD });

// 14か月前終了(約420日前) — 1年ウィンドウ外、2年以内。カードには出ずtraining-reports一覧のみに出る想定
const b14moEnd = addDays(TODAY, -420);
const b14moStart = addDays(b14moEnd, -90);
const { ticketId: b14moTicketId } = await createContractLicenseTicket({
  clientId,
  userId: studentBId,
  plan: STANDARD,
  startDate: b14moStart,
  endDate: b14moEnd,
  note: `QA自動テスト(feature-20260911-dev TrainingReport, tag=${TAG}) 生徒B 14か月前契約`,
});
await seedSchedule({ ticketId: b14moTicketId, studentId: studentBId, coachId: coachAId, slotNo: 1, status: 9, startDate: b14moStart, endDate: b14moEnd, plan: STANDARD });

// 25か月前終了(約760日前) — 2年超。history一覧でも表示されることを確認する最古データ
const b25moEnd = addDays(TODAY, -760);
const b25moStart = addDays(b25moEnd, -90);
const { ticketId: b25moTicketId } = await createContractLicenseTicket({
  clientId,
  userId: studentBId,
  plan: STANDARD,
  startDate: b25moStart,
  endDate: b25moEnd,
  note: `QA自動テスト(feature-20260911-dev TrainingReport, tag=${TAG}) 生徒B 25か月前契約`,
});
await seedSchedule({ ticketId: b25moTicketId, studentId: studentBId, coachId: coachAId, slotNo: 1, status: 9, startDate: b25moStart, endDate: b25moEnd, plan: STANDARD });

console.log("生徒B投入完了:", { bCurTicketId, b8moTicketId, b14moTicketId, b25moTicketId });

// ---------------------------------------------------------------------------
// 生徒D: 週2回契約をコーチA/コーチBで分担(slot_no 1/2、同一ticket)
// ---------------------------------------------------------------------------
console.log("\n--- 生徒D: コーチ分担契約 ---");
const dStart = addDays(TODAY, -15);
const dEnd = addDays(TODAY, 75);
const { ticketId: dTicketId } = await createContractLicenseTicket({
  clientId,
  userId: studentDId,
  plan: BUSINESS_PRO,
  startDate: dStart,
  endDate: dEnd,
  note: `QA自動テスト(feature-20260911-dev TrainingReport, tag=${TAG}) 生徒D`,
});
await seedSchedule({ ticketId: dTicketId, studentId: studentDId, coachId: coachAId, slotNo: 1, status: 1, startDate: dStart, endDate: dEnd, plan: BUSINESS_PRO });
await seedSchedule({ ticketId: dTicketId, studentId: studentDId, coachId: coachBId, slotNo: 2, status: 1, startDate: dStart, endDate: dEnd, plan: BUSINESS_PRO });
console.log("生徒D投入完了:", { dTicketId });

// ---------------------------------------------------------------------------
// 生徒E: 過去に担当was解消済み(is_active=false)。コーチAの現役の担当関係が無い状態を作る
// ---------------------------------------------------------------------------
console.log("\n--- 生徒E: 担当解消済み(is_active=false) ---");
const eEnd = addDays(TODAY, -100);
const eStart = addDays(eEnd, -90);
const { ticketId: eTicketId } = await createContractLicenseTicket({
  clientId,
  userId: studentEId,
  plan: STANDARD,
  startDate: eStart,
  endDate: eEnd,
  note: `QA自動テスト(feature-20260911-dev TrainingReport, tag=${TAG}) 生徒E`,
});
await seedSchedule({ ticketId: eTicketId, studentId: studentEId, coachId: coachAId, slotNo: 1, status: 9, startDate: eStart, endDate: eEnd, plan: STANDARD });
console.log("生徒E投入完了(コーチAとの唯一のscheduleがstatus=9のため、is_active=falseになるはず):", { eTicketId });

// ---------------------------------------------------------------------------
// サインアウトは不要(admin clientはservice_role、seedではsignInAsRoleを使っていない)
// ---------------------------------------------------------------------------
console.log(`\n=== 投入完了 (tag=${TAG}) ===`);
console.log(
  JSON.stringify(
    {
      tag: TAG,
      clientId,
      coachAId,
      coachBId,
      coachOutsiderId,
      studentAId,
      studentBId,
      studentDId,
      studentEId,
      tickets: { aTicketId, bCurTicketId, b8moTicketId, b14moTicketId, b25moTicketId, dTicketId, eTicketId },
    },
    null,
    2
  )
);
console.log("\n次のステップ: training-report-comment-verify.ts を同じ --env / --tag で実行してください。");
console.log(`ブラウザ確認用ログイン(共通パスワードはQA_LIVE_SESSION_TEST_PASSWORDと同じ):`);
console.log(`  コーチA: ${TAG}-tr-coach-a@gabby-qa-test.example`);
console.log(`  コーチB: ${TAG}-tr-coach-b@gabby-qa-test.example`);
