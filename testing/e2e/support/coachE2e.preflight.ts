/**
 * コーチアプリのE2E（e2e/tests/coach/・e2e/tests/journeys/coach-live-session.spec.ts）を流す前の確認。読み取りだけで、データは変えない。
 * 実行: pnpm --filter @gabby/testing e2e:preflight:coach（ステージングは e2e:preflight:coach:staging）
 *
 * - リリースSQLの反映: テストが使う RPC・列があるか（アプリだけ先にデプロイされると、新しい列・RPCが無く失敗する。CONVENTIONS.md 7章）
 * - 固定アカウント: qa-coach-ca-01（coach/shell-navigation.spec.ts のログイン先）がコーチとして存在するか
 * - マスタ・教材: 使い捨ての契約に使うプラン、Live Sprint のスプリント教材、Session 1 にコーチ用スライドがあるダイアログ教材
 * - 接続先: コーチのサイトのログイン画面が開けるか（dev はローカルの dev サーバーが起動している場合だけ確認する）
 * 1つでも NG があれば終了コード1で終わる。
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../helpers/env.ts";
import { createAdminClient } from "../../helpers/auth.ts";
import { assertReleaseApplied } from "../../helpers/preflight.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
process.env.E2E_ENV = env;
const { COACH_BASE_URL } = await import("./targets.ts");
const { QA_COACH_EMAIL } = await import("./coachApp.ts");

const admin = await createAdminClient();
const results: { item: string; ok: boolean; detail: string }[] = [];
const check = (item: string, ok: boolean, detail = "") => results.push({ item, ok, detail });
const DUMMY_ID = "00000000-0000-0000-0000-000000000000";

// リリースSQLの反映（RPC。ダミー引数での呼び出しは業務エラーになるだけで、データは変えない）
try {
  await assertReleaseApplied(admin, [
    { name: "approve_matching_request", dummyArgs: { p_request_id: DUMMY_ID } },
    { name: "reject_matching_request", dummyArgs: { p_request_id: DUMMY_ID, p_reason: "preflight" } },
    { name: "finalize_session", dummyArgs: { p_session_id: DUMMY_ID } },
    { name: "record_session_call_join", dummyArgs: { p_session_id: DUMMY_ID } },
  ]);
  check("RPC（承認・否認・終了処理・入退室）", true);
} catch (e) {
  check("RPC（承認・否認・終了処理・入退室）", false, e instanceof Error ? e.message : String(e));
}

// リリースSQLの反映（列）
for (const [table, column] of [
  ["com_t_matching_request", "requested_timezone"],
  ["com_m_lesson_schedule", "schedule_timezone"],
  ["com_t_session", "completion_result"],
  ["lesson_t_sprint", "session_id"],
  ["com_t_session_dialogue_log", "dialogue_session_id"],
] as const) {
  const { error } = await admin.from(table).select(column).limit(1);
  check(`列 ${table}.${column}`, !error, error?.message ?? "");
}

// 固定アカウント（コーチ）
let coachUserId: string | undefined;
for (let page = 1; page <= 20 && !coachUserId; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) break;
  coachUserId = data.users.find((u) => u.email === QA_COACH_EMAIL)?.id;
  if (data.users.length < 200) break;
}
const { data: coachUser } = coachUserId
  ? await admin.from("com_m_user").select("user_type, delete_flg").eq("id", coachUserId).maybeSingle()
  : { data: null };
check(`固定アカウント ${QA_COACH_EMAIL}`, coachUser?.user_type === "2" && coachUser?.delete_flg === "0", coachUserId ? JSON.stringify(coachUser) : "ユーザーが無い");

// マスタ・教材
const { data: plan } = await admin.from("com_m_contract_plan").select("plan_id").eq("plan_code", "LIVE_WEEKLY1_3M").maybeSingle();
check("プラン LIVE_WEEKLY1_3M", !!plan);
const { count: sprintCount } = await admin
  .from("com_m_contents").select("content_id", { count: "exact", head: true })
  .eq("content_type", 2).in("content_scope", [0, 1]).eq("delete_flg", "0").not("content_name", "like", "[%");
check("スプリント教材（共通・限定公開）", (sprintCount ?? 0) > 0, `${sprintCount ?? 0}件`);
const { data: dialogueSessions } = await admin
  .from("com_m_dialogue_session").select("content_id").eq("session_no", 1).not("coach_slides_link", "is", null).eq("delete_flg", "0").limit(50);
const { count: dialogueCount } = await admin
  .from("com_m_contents").select("content_id", { count: "exact", head: true })
  .eq("content_type", 3).in("content_scope", [0, 1]).eq("delete_flg", "0").not("content_name", "like", "[%")
  .in("content_id", (dialogueSessions ?? []).map((d) => d.content_id));
check("ダイアログ教材（Session 1 にコーチ用スライドあり）", (dialogueCount ?? 0) > 0, `${dialogueCount ?? 0}件`);

// 接続先
try {
  if (env === "dev") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // dev:ssl は自己署名証明書
  const res = await fetch(`${COACH_BASE_URL}/login`, { redirect: "manual" });
  check(`コーチのサイト ${COACH_BASE_URL}/login`, res.status === 200, `HTTP ${res.status}`);
} catch (e) {
  check(`コーチのサイト ${COACH_BASE_URL}/login`, env === "dev", `${e instanceof Error ? e.message : String(e)}${env === "dev" ? "（dev は Playwright が起動するため問題なし）" : ""}`);
}

console.log(`[coach E2E preflight] env=${env}`);
for (const r of results) console.log(`${r.ok ? "OK" : "NG"}  ${r.item}${r.detail ? `  — ${r.detail}` : ""}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
