/**
 * testing/FIXTURES.md 記載の「固定アカウント」を投入する冪等スクリプト。
 * testing/features/branches/ のブランチ検証用シード（${TAG}付き・使い捨て前提）とは異なり、
 * 本スクリプトが作るアカウント・契約・学習履歴は恒久的に使い回す前提（TAGなし、削除しない）。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/fixtures/seed-fixed-accounts.ts --env=staging
 *
 * 【ターム（契約期間）の考え方】
 *   2026-06-01(JST)を起点とする3か月単位の「ターム」で契約・ライセンスを管理する
 *   （T0=2026-06-01〜08-31, T1=09-01〜11-30, T2=12-01〜2027-02-28, ...）。日付は絶対値のため
 *   何度実行しても同じ行を指す。実行日を含むタームを「当期」とし、実行するたびに
 *   前期・当期（・次期）の不足分だけを補完する。定期的に再実行すれば過去タームの契約・
 *   学習履歴がそのまま残り続け、「過去分が必要なテスト」の土台として蓄積されていく。
 *
 * 【生徒ペルソナ】FIXTURES.md「固定アカウント一覧」を参照。ライセンスは同一ユーザーで
 *   期間が重ならないようにする（com_t_user_license.excl_user_license_active_overlap）。
 *   既に期間の重なる有効ライセンスがある場合は新規作成をスキップする（dev等、本スクリプト
 *   導入前に作られた固定アカウントとの互換のため）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../helpers/env.ts";
import { createAdminClient, signInAsRole } from "../../helpers/auth.ts";
import { assertReleaseApplied } from "../../helpers/preflight.ts";
import { currentTermIndex, termOf, type Term } from "../../helpers/fixture-terms.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;

const FIXED_CLIENT_NAME = "【QA固定】E2E/データ主体共通アカウント";
const ADMIN_EMAIL = "qa-admin@gabby-qa-test.example";

const admin = await createAdminClient();

console.log(`\n=== 固定アカウント投入: env=${env} ===`);

await assertReleaseApplied(admin, [
  { name: "admin_match_student_with_coach", dummyArgs: { p_ticket_id: "00000000-0000-0000-0000-000000000000", p_coach_id: "00000000-0000-0000-0000-000000000000", p_slot_no: 1, p_day_of_week: 1, p_start_time: "10:00:00", p_end_time: "10:30:00" } },
]);
console.log("preflight OK: admin_match_student_with_coach は反映済み");

// ---------------------------------------------------------------------------
// ターム（testing/helpers/fixture-terms.ts）
// ---------------------------------------------------------------------------
const NOW = new Date();
const CUR = currentTermIndex(NOW);
const PREV = CUR - 1;
const NEXT = CUR + 1;
console.log(`当期: ${termOf(CUR).label} / 前期: ${termOf(PREV).label} / 次期: ${termOf(NEXT).label}`);

// ---------------------------------------------------------------------------
// マスタ系（顧客・ユーザー・ロール・Availability）
// ---------------------------------------------------------------------------
async function ensureClient(name: string): Promise<string> {
  const { data: existing } = await admin.from("com_m_client").select("client_id").eq("client_name", name).maybeSingle();
  if (existing) return existing.client_id as string;
  const { data, error } = await admin.from("com_m_client").insert({ client_name: name, client_type: 1, industry_type: 1 }).select("client_id").single();
  if (error) throw error;
  return data.client_id as string;
}

async function findAuthUserByEmail(email: string): Promise<string | undefined> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return undefined;
}

async function ensureUser(params: { email: string; userType: "0" | "1" | "2"; userName: string; clientId: string | null; timezone?: string }): Promise<string> {
  let userId = await findAuthUserByEmail(params.email);
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email: params.email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error } = await admin
    .from("com_m_user")
    .update({ client_id: params.clientId, user_type: params.userType, user_name: params.userName, ...(params.timezone ? { timezone: params.timezone } : {}) })
    .eq("id", userId);
  if (error) throw error;
  return userId;
}

async function ensureRole(userId: string, roleId: string): Promise<void> {
  const { data } = await admin.from("com_t_user_role").select("role_id").eq("user_id", userId).eq("role_id", roleId).maybeSingle();
  if (data) return;
  const { error } = await admin.from("com_t_user_role").insert({ user_id: userId, role_id: roleId });
  if (error) throw error;
}

async function ensureCoachAvailability(coachId: string, days: number[], start: string, end: string): Promise<void> {
  const { data: existing } = await admin.from("com_m_coach_availability").select("availability_id").eq("coach_id", coachId).limit(1);
  if (existing && existing.length > 0) return;
  const { error } = await admin.from("com_m_coach_availability").insert(days.map((dow) => ({ coach_id: coachId, day_of_week: dow, start_time: start, end_time: end })));
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// 契約・ライセンス（タームごと。noteで識別して冪等にする）
// ---------------------------------------------------------------------------
type PlanCode = "BLUEPRINT_ONLY" | "LIVE_WEEKLY1_3M";

async function ensureContract(clientId: string, planCode: PlanCode, term: Term, maxLicenses: number): Promise<string> {
  const note = `【QA固定】${planCode} ${term.label}`;
  const { data: existing } = await admin.from("com_m_contract").select("contract_id").eq("client_id", clientId).eq("note", note).maybeSingle();
  if (existing) return existing.contract_id as string;

  const { data: plan, error: planErr } = await admin.from("com_m_contract_plan").select("*").eq("plan_code", planCode).single();
  if (planErr) throw planErr;
  const { data, error } = await admin
    .from("com_m_contract")
    .insert({
      client_id: clientId,
      plan_id: plan.plan_id,
      plan_name: plan.plan_name,
      plan_name_en: plan.plan_name_en,
      contract_type: plan.contract_type,
      weekly_frequency: plan.weekly_frequency,
      total_sessions: plan.total_sessions,
      has_dialogue_practice: plan.has_dialogue_practice,
      max_licenses: maxLicenses,
      start_date: term.startIso,
      end_date: term.endIso,
      status: 1,
      note,
    })
    .select("contract_id")
    .single();
  if (error) throw error;
  return data.contract_id as string;
}

/** 戻り値: 作成/既存のlicense_id。期間の重なる別の有効ライセンスがある場合はundefined（スキップ）。 */
async function ensureLicense(userId: string, contractId: string, term: Term, status: 0 | 1): Promise<string | undefined> {
  const { data: existing } = await admin.from("com_t_user_license").select("license_id").eq("user_id", userId).eq("contract_id", contractId).maybeSingle();
  if (existing) return existing.license_id as string;

  if (status === 1) {
    const { data: overlap } = await admin
      .from("com_t_user_license")
      .select("license_id, start_date, end_date")
      .eq("user_id", userId)
      .eq("status", 1)
      .lte("start_date", term.endIso)
      .gte("end_date", term.startIso)
      .limit(1);
    if (overlap && overlap.length > 0) {
      console.log(`  ⚠ ${term.label}と期間の重なる有効ライセンスが既にあるためスキップ:`, overlap[0]);
      return undefined;
    }
  }

  const { data, error } = await admin
    .from("com_t_user_license")
    .insert({ contract_id: contractId, user_id: userId, status, start_date: term.startIso, end_date: term.endIso, note: "【QA固定】" })
    .select("license_id")
    .single();
  if (error) throw error;
  return data.license_id as string;
}

// ---------------------------------------------------------------------------
// 学習履歴（生徒モニタリング画面の「過去分」検証用）
// ---------------------------------------------------------------------------
interface HistoryContents {
  wordContentId: string;
  sprintContentId: string;
}

/**
 * 学習履歴に使う教材を選ぶ（共通公開(0)優先、無ければ限定公開(1)）。限定公開の場合は
 * 固定テナントにアクセス権（com_m_contents_access）を付与し、固定アカウントでも画面から
 * 教材名が見える状態にする（環境によっては共通公開の単語/スプリント教材が存在しないため）。
 */
async function pickHistoryContents(clientId: string): Promise<HistoryContents> {
  const pick = async (contentType: number): Promise<string> => {
    const { data, error } = await admin
      .from("com_m_contents")
      .select("content_id, content_scope")
      .eq("content_type", contentType)
      .in("content_scope", [0, 1])
      .eq("delete_flg", "0")
      .order("content_scope")
      .order("content_id")
      .limit(1)
      .single();
    if (error) throw new Error(`content_type=${contentType}の公開中教材が見つかりません: ${error.message}`);
    if (data.content_scope === 1) {
      const { data: access } = await admin.from("com_m_contents_access").select("access_id").eq("client_id", clientId).eq("content_id", data.content_id).eq("delete_flg", "0").maybeSingle();
      if (!access) {
        const { error: accessErr } = await admin.from("com_m_contents_access").insert({ client_id: clientId, content_id: data.content_id, notes: "【QA固定】学習履歴フィクスチャ用" });
        if (accessErr) throw accessErr;
      }
    }
    return data.content_id as string;
  };
  return { wordContentId: await pick(0), sprintContentId: await pick(2) };
}

/** 対象月の10日(JST)に、単語ドリル・スプリント・スプリントドリルの実績を1件ずつ作る。実行日より未来の月は作らない。 */
async function ensureMonthlyHistory(userId: string, year: number, month: number, contents: HistoryContents): Promise<boolean> {
  const trainingDate = `${year}-${String(month).padStart(2, "0")}-10`;
  const trainedAt = new Date(Date.UTC(year, month - 1, 10, 3, 0, 0)); // JST 12:00
  if (trainedAt > NOW) return false;

  const { data: word } = await admin.from("self_t_word_summary").select("summary_id").eq("user_id", userId).eq("training_date", trainingDate).limit(1);
  if (!word || word.length === 0) {
    const { error } = await admin.from("self_t_word_summary").insert({ user_id: userId, content_id: contents.wordContentId, training_date: trainingDate, word_count: 10, phrase_count: 5, assessment_count: 8 });
    if (error) throw error;
  }

  const { data: drill } = await admin.from("self_t_sprint_summary").select("summary_id").eq("user_id", userId).eq("training_date", trainingDate).limit(1);
  if (!drill || drill.length === 0) {
    const { error } = await admin.from("self_t_sprint_summary").insert({ user_id: userId, content_id: contents.sprintContentId, training_date: trainingDate, question_count: 20, assessment_count: 15, speed_count: 5, structure_count: 5, builders_count: 5, mastery_count: 5 });
    if (error) throw error;
  }

  const { data: sprint } = await admin.from("self_t_sprint").select("self_sprint_id").eq("user_id", userId).eq("insert_date", trainedAt.toISOString()).limit(1);
  if (!sprint || sprint.length === 0) {
    const { error } = await admin.from("self_t_sprint").insert({
      user_id: userId,
      sprint_type: "1",
      content_id: contents.sprintContentId,
      question_type: "0",
      answer_type: "0",
      difficulty_level: 1,
      time_limit_sec: 60,
      total_answered: 10,
      total_assessments: 8,
      insert_date: trainedAt.toISOString(),
      update_date: trainedAt.toISOString(),
    });
    if (error) throw error;
  }
  return true;
}

async function ensureTermHistory(userId: string, term: Term, contents: HistoryContents): Promise<void> {
  for (const ym of term.months) {
    await ensureMonthlyHistory(userId, ym.year, ym.month, contents);
  }
}

// ---------------------------------------------------------------------------
// ライブ契約（qa-student-01 × qa-coach-ca-01）
// ---------------------------------------------------------------------------
async function ensureLiveMatch(studentId: string, coachId: string, clientId: string, term: Term): Promise<void> {
  const contractId = await ensureContract(clientId, "LIVE_WEEKLY1_3M", term, 1);
  const licenseId = await ensureLicense(studentId, contractId, term, 1);
  if (!licenseId) return;

  const { data: plan } = await admin.from("com_m_contract_plan").select("weekly_frequency, total_sessions").eq("plan_code", "LIVE_WEEKLY1_3M").single();
  let { data: ticket } = await admin.from("com_t_user_session_ticket").select("ticket_id").eq("license_id", licenseId).maybeSingle();
  if (!ticket) {
    const { data, error } = await admin
      .from("com_t_user_session_ticket")
      .insert({ license_id: licenseId, contract_id: contractId, user_id: studentId, weekly_frequency: plan?.weekly_frequency, total_sessions: plan?.total_sessions, used_sessions: 0 })
      .select("ticket_id")
      .single();
    if (error) throw error;
    ticket = data;
  }

  const { data: schedule } = await admin.from("com_m_lesson_schedule").select("schedule_id").eq("ticket_id", ticket.ticket_id).limit(1);
  if (schedule && schedule.length > 0) return;

  // コーチのAvailability（月・水・金 18:00〜22:00 バンクーバー）に沿う月曜18:00枠でマッチング成立させる
  const adminClient = await signInAsRole(ADMIN_EMAIL, PASSWORD);
  const { data: scheduleId, error } = await adminClient.rpc("admin_match_student_with_coach", {
    p_ticket_id: ticket.ticket_id,
    p_coach_id: coachId,
    p_slot_no: 1,
    p_day_of_week: 1,
    p_start_time: "18:00:00",
    p_end_time: "18:30:00",
  });
  if (error) throw error;
  console.log(`  ライブ契約のマッチングを確立: ${term.label} schedule=${scheduleId}`);
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------
const clientId = await ensureClient(FIXED_CLIENT_NAME);
const contents = await pickHistoryContents(clientId);

const adminUserId = await findAuthUserByEmail(ADMIN_EMAIL);
if (!adminUserId) {
  await ensureUser({ email: ADMIN_EMAIL, userType: "0", userName: "QAアドミン", clientId: null });
}

const coachCa = await ensureUser({ email: "qa-coach-ca-01@gabby-qa-test.example", userType: "2", userName: "QAコーチCA01", clientId, timezone: "America/Vancouver" });
const coachUs = await ensureUser({ email: "qa-coach-us-01@gabby-qa-test.example", userType: "2", userName: "QAコーチUS01", clientId, timezone: "America/New_York" });
await ensureCoachAvailability(coachCa, [1, 3, 5], "18:00:00", "22:00:00");
await ensureCoachAvailability(coachUs, [2, 4], "10:00:00", "16:00:00");

const appContract = async (term: Term) => ensureContract(clientId, "BLUEPRINT_ONLY", term, 10);

/** ペルソナ定義: 各タームで付与するライセンス状態（null=付与しない）と、学習履歴を作るか。 */
interface Persona {
  no: string;
  name: string;
  roles?: string[];
  prev: 0 | 1 | null;
  cur: 0 | 1 | "live" | null;
  next: 0 | 1 | null;
  /** ライセンスの無い当期にも学習履歴を作る（モニタリングの除外確認用） */
  historyWithoutLicense?: boolean;
}

const personas: Persona[] = [
  { no: "01", name: "QA生徒01（継続・ライブ受講）", prev: 1, cur: "live", next: null },
  { no: "02", name: "QA生徒02（モニター）", roles: ["monitor"], prev: 1, cur: 1, next: null },
  { no: "03", name: "QA生徒03（前期のみ・解約）", prev: 1, cur: null, next: null, historyWithoutLicense: true },
  { no: "04", name: "QA生徒04（当期ライセンス停止）", prev: 1, cur: 0, next: null, historyWithoutLicense: true },
  { no: "05", name: "QA生徒05（次期から開始）", prev: null, cur: null, next: 1 },
  { no: "06", name: "QA生徒06（デモユーザー）", roles: ["demo_user"], prev: 1, cur: 1, next: null },
];

const studentIds: Record<string, string> = {};
for (const p of personas) {
  const email = `qa-student-${p.no}@gabby-qa-test.example`;
  const userId = await ensureUser({ email, userType: "1", userName: p.name, clientId });
  studentIds[p.no] = userId;
  for (const r of p.roles ?? []) await ensureRole(userId, r);
  console.log(`- ${email} ${p.name}`);

  for (const [termIndex, state] of [[PREV, p.prev], [CUR, p.cur], [NEXT, p.next]] as const) {
    if (state === null) continue;
    const term = termOf(termIndex);
    if (state === "live") {
      await ensureLiveMatch(userId, coachCa, clientId, term);
    } else {
      await ensureLicense(userId, await appContract(term), term, state);
    }
    if (state !== 0) await ensureTermHistory(userId, term, contents);
  }
  if (p.historyWithoutLicense) await ensureTermHistory(userId, termOf(CUR), contents);
}

console.log("\n=== 投入完了 ===");
console.log({ clientId, coachCa, coachUs, students: studentIds });
