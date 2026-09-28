/**
 * 生徒モニタリング画面の対象生徒判定（private.get_monitor_target_users への一本化）の検証。
 * 受講生一覧・単語ドリル履歴・スプリント履歴・スプリントドリル履歴の4RPCが、
 * 「対象期間にstatus=1のライセンスが重なる、デモでない受講生」だけを返すことを確認する。
 *
 * 固定アカウント（testing/FIXTURES.md。seed-fixed-accounts.tsで投入済み）の前期・当期の
 * 契約と月次学習履歴をそのまま使う読み取り専用の検証のため、seed/cleanupは無い。
 * モニターロールを持つ qa-student-02 の実サインインJWTでRPCを呼ぶ（get_jwt_client_id依存）。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260918-dev/monitor-target-period-verify.ts --env=staging --tag=stg0924
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import { assertReleaseApplied, assertRpcRemoved } from "../../../helpers/preflight.ts";
import { writeResultLog, type CheckResult } from "../../../helpers/results.ts";
import { currentTermIndex, monthRange, termOf } from "../../../helpers/fixture-terms.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const PASSWORD = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}

const service = await createAdminClient(); // 固定アカウントのID解決・preflight専用
const checks: CheckResult[] = [];
function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` … ${detail}` : ""}`);
}

console.log(`\n=== 生徒モニタリング対象期間判定の検証: env=${env} tag=${TAG} ===`);

await assertReleaseApplied(service, [
  { name: "get_monitor_user_list", dummyArgs: { _start_date: "2026-01-01", _end_date: "2026-01-31", _include_monitor: false } },
]);

// 固定アカウントのID
const PERSONAS = ["01", "02", "03", "04", "05", "06"] as const;
type PersonaNo = (typeof PERSONAS)[number];
const idOf = {} as Record<PersonaNo, string>;
for (const no of PERSONAS) {
  const { data, error } = await service.from("com_m_user").select("id").like("user_name", `QA生徒${no}（%`).single();
  if (error) throw new Error(`固定アカウント qa-student-${no} が見つかりません（seed-fixed-accounts.tsを先に実行してください）: ${error.message}`);
  idOf[no] = data.id as string;
}
const noOf = new Map(Object.entries(idOf).map(([no, id]) => [id, no]));
const toNos = (ids: string[]) => [...new Set(ids.map((id) => noOf.get(id) ?? `外部:${id.slice(0, 8)}`))].sort();
const eqSet = (actual: string[], expected: string[]) => JSON.stringify(actual) === JSON.stringify([...expected].sort());

const monitor = await signInAsRole("qa-student-02@gabby-qa-test.example", PASSWORD);

const cur = termOf(currentTermIndex());
const prev = termOf(currentTermIndex() - 1);
const next = termOf(currentTermIndex() + 1);
const prevMid = monthRange(prev.months[1]);
const prevLast = monthRange(prev.months[2]);
const curFirst = monthRange(cur.months[0]);
const curLast = monthRange(cur.months[2]);
const nextFirst = monthRange(next.months[0]);

async function userList(range: { start: string; end: string }, includeMonitor: boolean): Promise<string[]> {
  const { data, error } = await monitor.rpc("get_monitor_user_list", { _start_date: range.start, _end_date: range.end, _include_monitor: includeMonitor });
  if (error) throw new Error(`get_monitor_user_list: ${error.message}`);
  return toNos((data as { id: string }[]).map((r) => r.id));
}

async function historyUsers(rpc: "get_monitor_word_history" | "get_monitor_sprint_drill_history" | "get_monitor_sprint_history", range: { start: string; end: string }, includeMonitor: boolean, userIds?: string[]): Promise<string[]> {
  const isTimestamp = rpc === "get_monitor_sprint_history";
  const { data, error } = await monitor.rpc(rpc, {
    _start_date: isTimestamp ? `${range.start}T00:00:00Z` : range.start,
    _end_date: isTimestamp ? `${range.end}T23:59:59Z` : range.end,
    _user_ids: userIds ?? null,
    _include_monitor: includeMonitor,
  });
  if (error) throw new Error(`${rpc}: ${error.message}`);
  return toNos((data as { user_id: string }[]).map((r) => r.user_id));
}

// --- 受講生一覧 ---------------------------------------------------------------
const expectPrev = ["01", "03", "04"]; // 02=モニター（既定は除外）, 05=次期から, 06=デモ
const expectCur = ["01"]; // 03=当期ライセンス無し, 04=当期ライセンス停止(status=0)
const cases: { label: string; range: { start: string; end: string }; includeMonitor: boolean; expected: string[] }[] = [
  { label: `前期の月(${prevMid.start})`, range: prevMid, includeMonitor: false, expected: expectPrev },
  { label: `前期の月(${prevMid.start})・モニター含む`, range: prevMid, includeMonitor: true, expected: [...expectPrev, "02"] },
  { label: `前期最終月(${prevLast.start})`, range: prevLast, includeMonitor: false, expected: expectPrev },
  { label: `当期の月(${curFirst.start})`, range: curFirst, includeMonitor: false, expected: expectCur },
  { label: `当期の月(${curFirst.start})・モニター含む`, range: curFirst, includeMonitor: true, expected: [...expectCur, "02"] },
  // 次期開始（JST 1日 00:00 = 前月末日 15:00 UTC）の直前月。qa-student-05 は含まれないのが正
  { label: `次期開始の直前月(${curLast.start})`, range: curLast, includeMonitor: false, expected: expectCur },
  { label: `次期の月(${nextFirst.start})`, range: nextFirst, includeMonitor: false, expected: ["05"] },
];
for (const c of cases) {
  const actual = await userList(c.range, c.includeMonitor);
  record(`受講生一覧: ${c.label} → 生徒${c.expected.join("/")}のみ`, eqSet(actual, c.expected), `actual=${actual.join(",") || "(なし)"}`);
}

// --- 実績（単語ドリル/スプリント/スプリントドリル） -----------------------------
// 学習履歴は各月10日に全生徒（05除く）分を用意しており、03/04は当期にも「ライセンス外の履歴」がある
for (const rpc of ["get_monitor_word_history", "get_monitor_sprint_history", "get_monitor_sprint_drill_history"] as const) {
  const p = await historyUsers(rpc, prevMid, false);
  record(`${rpc}: 前期の月 → 生徒${expectPrev.join("/")}の実績のみ`, eqSet(p, expectPrev), `actual=${p.join(",") || "(なし)"}`);
  const c = await historyUsers(rpc, curFirst, false);
  record(`${rpc}: 当期の月 → ライセンス外の03/04の実績は除外され01のみ`, eqSet(c, expectCur), `actual=${c.join(",") || "(なし)"}`);
  const m = await historyUsers(rpc, curFirst, true);
  record(`${rpc}: 当期の月・モニター含む → 01/02`, eqSet(m, ["01", "02"]), `actual=${m.join(",") || "(なし)"}`);
  const f = await historyUsers(rpc, prevMid, false, [idOf["03"], idOf["06"]]);
  record(`${rpc}: 前期の月・_user_ids=[03,06] → 対象生徒の03のみ（デモ06は指定しても除外）`, eqSet(f, ["03"]), `actual=${f.join(",") || "(なし)"}`);
}

// --- シグネチャ変更 -----------------------------------------------------------
const { error: noDateErr } = await monitor.rpc("get_monitor_user_list", { _include_monitor: false });
record("get_monitor_user_list: 対象期間を省略した呼び出しはエラーになる（NOW()基準のフォールバック廃止）", Boolean(noDateErr), noDateErr ? `${noDateErr.code}` : "エラーにならなかった");
try {
  await assertRpcRemoved(service, [{ name: "get_monitor_user_list", dummyArgs: { _include_monitor: false } }]);
  record("旧シグネチャ get_monitor_user_list(BOOLEAN) が削除されている", true);
} catch (e) {
  record("旧シグネチャ get_monitor_user_list(BOOLEAN) が削除されている", false, e instanceof Error ? e.message : String(e));
}
const { error: privateErr } = await monitor.schema("private").rpc("get_monitor_target_users", { _client_id: idOf["01"], _start_date: curFirst.start, _end_date: curFirst.end });
record("内部ヘルパー private.get_monitor_target_users は認証ユーザーから直接呼べない", Boolean(privateErr), privateErr ? `${privateErr.code}` : "呼び出せてしまった");

await signOutRole(monitor);

const log = writeResultLog({ scenario: "monitor-target-period", env, tag: TAG, checks });
console.log(`\n結果: ${log.passed}/${log.totalChecks} OK`);
