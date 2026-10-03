/**
 * トレーニングレポート（get_training_report_data）に、スプリントのセッション（制限時間あり。self_t_sprint）の実績が
 * 含まれることの検証（仕様: testing/e2e/specs/training/training-stats.md 異常系 #12）。
 * 実績は生徒のタイムゾーンでの実施日で数え、レポートの期間はライセンスの開始・終了の日本時間の日付で絞る。
 *
 * シナリオ（タグ付きの使い捨てデータ。アプリのみ契約、ライセンス期間は 2026-09-01〜09-30 JST）:
 *   - 生徒J（Asia/Tokyo）:
 *       単語帳 9/10（単語5・発話1）、ドリル 9/10（問題10・発話2）、
 *       セッション 9/10 12:00 JST（回答7・発話3）・9/20（回答4）・9/1 0:30 JST（=UTC 8/31。回答2）・10/1 0:30 JST（=UTC 9/30。期間外）
 *       → 学習日数3（9/1・9/10・9/20）、スプリント問題数23、発話評価6、月別は9月のみ
 *   - 生徒N（America/New_York）: セッション 9/30 22:00 NY（=UTC 10/1 02:00。回答6）
 *       → 生徒のタイムゾーンでは9/30のため期間内（学習日数1、スプリント問題数6）
 * 記録はDBへ直接作る（トレーニングの実施は音声の入出力が必要なため）。レポートはアドミンと同じく service_role で取得する。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20261001-dev/training-report-sessions-verify.ts --env=dev --tag=trs01
 *   検証後はタグで作成したデータを削除する（--keep 指定時は残す）。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient } from "../../../helpers/auth.ts";
import { writeResultLog, type CheckResult } from "../../../helpers/results.ts";
import type { TrainingReportData } from "@gabby/types/trainingReport";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const KEEP = process.argv.includes("--keep");
const PASSWORD_ENV = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD_ENV) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}
const PASSWORD: string = PASSWORD_ENV;

const service = await createAdminClient(); // データ投入・結果の読み取り・後始末専用
const checks: CheckResult[] = [];
function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` … ${detail}` : ""}`);
}

console.log(`\n=== トレーニングレポートのスプリントのセッションの検証: env=${env} tag=${TAG} ===`);

// ---------------------------------------------------------------------------
// データ投入
// ---------------------------------------------------------------------------
const clientName = `【QAテスト】レポートのセッション検証（${TAG}）`;
const { data: client, error: clientErr } = await service.from("com_m_client").insert({ client_name: clientName, client_type: 1, industry_type: 1 }).select("client_id").single();
if (clientErr) throw clientErr;
const clientId = client.client_id as string;

async function createStudent(label: string, timezone: string): Promise<string> {
  const email = `${TAG}-${label}@gabby-qa-test.example`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const { error: updErr } = await service
    .from("com_m_user")
    .update({ client_id: clientId, user_type: "1", user_name: `QAテスト生徒${label}（${TAG}）`, timezone })
    .eq("id", data.user.id);
  if (updErr) throw updErr;
  return data.user.id;
}

const studentJ = await createStudent("J", "Asia/Tokyo");
const studentN = await createStudent("N", "America/New_York");
const userIds = [studentJ, studentN];

const licenseIds: Record<string, string> = {};
try {
  const START = "2026-08-31T15:00:00.000Z"; // 2026-09-01 00:00 JST
  const END = "2026-09-30T14:59:59.999Z"; // 2026-09-30 23:59:59.999 JST
  const { data: plan, error: planErr } = await service.from("com_m_contract_plan").select("*").eq("plan_code", "BLUEPRINT_ONLY").single();
  if (planErr) throw planErr;
  const { data: contract, error: cErr } = await service
    .from("com_m_contract")
    .insert({
      client_id: clientId, plan_id: plan.plan_id, plan_name: plan.plan_name, plan_name_en: plan.plan_name_en,
      contract_name: `【QAテスト】${TAG}`, max_licenses: 2, start_date: START, end_date: END, status: 1,
      contract_type: plan.contract_type, has_dialogue_practice: plan.has_dialogue_practice, note: `【QAテスト】${TAG}`,
    })
    .select("contract_id")
    .single();
  if (cErr) throw cErr;
  for (const userId of userIds) {
    const { data: license, error } = await service
      .from("com_t_user_license")
      .insert({ contract_id: contract.contract_id, user_id: userId, status: 1, start_date: START, end_date: END })
      .select("license_id")
      .single();
    if (error) throw error;
    licenseIds[userId] = license.license_id;
  }

  const { data: word } = await service.from("com_m_contents").select("content_id").eq("content_type", 0).eq("delete_flg", "0").limit(1).single();
  const { data: sprint } = await service.from("com_m_contents").select("content_id").eq("content_type", 2).eq("delete_flg", "0").limit(1).single();
  if (!word || !sprint) throw new Error("単語帳・スプリントの教材が見つかりません");

  const { error: wErr } = await service.from("self_t_word_summary").insert({
    user_id: studentJ, content_id: word.content_id, training_date: "2026-09-10", word_count: 5, phrase_count: 8, assessment_count: 1,
  });
  if (wErr) throw wErr;
  const { error: dErr } = await service.from("self_t_sprint_summary").insert({
    user_id: studentJ, content_id: sprint.content_id, training_date: "2026-09-10", question_count: 10, assessment_count: 2, speed_count: 10,
  });
  if (dErr) throw dErr;
  const session = (userId: string, insertDate: string, answered: number, assessments: number) => ({
    user_id: userId, sprint_type: "0", content_id: sprint.content_id, question_type: "0", answer_type: "0",
    difficulty_level: 1, time_limit_sec: 60, total_answered: answered, total_assessments: assessments, insert_date: insertDate,
  });
  const { error: sErr } = await service.from("self_t_sprint").insert([
    session(studentJ, "2026-09-10T03:00:00Z", 7, 3), // 9/10 12:00 JST（単語帳・ドリルと同じ日）
    session(studentJ, "2026-09-20T03:00:00Z", 4, 0), // 9/20 12:00 JST
    session(studentJ, "2026-08-31T15:30:00Z", 2, 0), // 9/1 0:30 JST（UTCでは8月）
    session(studentJ, "2026-09-30T15:30:00Z", 9, 1), // 10/1 0:30 JST（期間外）
    session(studentN, "2026-10-01T02:00:00Z", 6, 0), // 9/30 22:00 NY（UTCでは10月）
  ]);
  if (sErr) throw sErr;

  // -------------------------------------------------------------------------
  // 検証
  // -------------------------------------------------------------------------
  const { data, error } = await service.rpc("get_training_report_data", { p_license_ids: Object.values(licenseIds) });
  if (error) throw error;
  const reports = data as TrainingReportData[];
  const reportJ = reports.find((r) => r.student_id === studentJ);
  const reportN = reports.find((r) => r.student_id === studentN);

  const a = reportJ?.activity;
  record(
    "生徒J: 学習日数にセッションだけの日（9/1・9/20）を含める",
    a?.active_days === 3,
    `active_days=${a?.active_days}`
  );
  record(
    "生徒J: スプリント問題数＝ドリルの問題数＋期間内のセッションの回答数（10+7+4+2）",
    a?.sprint_questions === 23,
    `sprint_questions=${a?.sprint_questions}`
  );
  record("生徒J: 発話評価にセッションの発話を含める（1+2+3）", a?.assessments === 6, `assessments=${a?.assessments}`);
  record("生徒J: 単語帳の数は変わらない", a?.words === 5 && a?.phrases === 8, `words=${a?.words} phrases=${a?.phrases}`);
  record(
    "生徒J: 月別は9月だけ（期間外の10/1 JST の回は入らない）",
    reportJ?.monthly.length === 1 && reportJ.monthly[0].month === "2026-09" && reportJ.monthly[0].sprint_questions === 23,
    JSON.stringify(reportJ?.monthly)
  );
  record(
    "生徒N: 生徒のタイムゾーンで9/30の回（UTCでは10/1）は期間内",
    reportN?.activity.active_days === 1 && reportN.activity.sprint_questions === 6,
    JSON.stringify(reportN?.activity)
  );
} finally {
  if (KEEP) {
    console.log(`\n--keep 指定のためデータを残しました（tag=${TAG}）`);
  } else {
    console.log("\n--- 後始末 ---");
    const del = async (label: string, fn: () => PromiseLike<{ error: unknown; count?: number | null }>) => {
      const { error, count } = await fn();
      console.log(`${error ? "NG" : "OK"} ${label}: ${count ?? "-"}件${error ? ` ${JSON.stringify(error)}` : ""}`);
    };
    await del("com_t_user_license", () => service.from("com_t_user_license").delete({ count: "exact" }).in("user_id", userIds));
    await del("com_m_contract", () => service.from("com_m_contract").delete({ count: "exact" }).eq("client_id", clientId));
    await del("com_m_user（記録・通算値・通知は連鎖削除）", () => service.from("com_m_user").delete({ count: "exact" }).in("id", userIds));
    for (const id of userIds) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) console.log(`NG auth.users ${id}: ${error.message}`);
    }
    await del("com_m_client", () => service.from("com_m_client").delete({ count: "exact" }).eq("client_id", clientId));
  }
}

writeResultLog({ scenario: "training-report-sessions", env, tag: TAG, checks });
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n結果: ${checks.length - failed}/${checks.length} OK`);
if (failed > 0) process.exit(1);
