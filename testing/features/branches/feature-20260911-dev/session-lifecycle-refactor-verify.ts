/**
 * session-lifecycle-refactor-seed.ts で投入したデータに対し、実際の業務RPC（finalize_session /
 * resolve_stale_session / cancel_session / admin_reschedule_session / release_lesson_schedule_slot /
 * invalidate_user_license）を該当ロールの実JWTで呼び出し(When)、結果(Then)を検証する。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260911-dev/session-lifecycle-refactor-verify.ts --env=dev --tag=lifecycle01
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

console.log(`\n=== セッションライフサイクル刷新 検証: env=${env} tag=${TAG} ===`);

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK" : "NG"}: ${name}${detail ? ` (${detail})` : ""}`);
}

// ---------------------------------------------------------------------------
// seed.tsが投入したユーザー・スケジュールをclient_name/emailから再特定する
// ---------------------------------------------------------------------------
const { data: client } = await admin.from("com_m_client").select("client_id").eq("client_name", `【QAテスト】セッションライフサイクル刷新検証（${TAG}）`).single();
if (!client) throw new Error("対象クライアントが見つかりません。session-lifecycle-refactor-seed.tsを先に実行してください。");

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

const coachEmail = `${TAG}-lifecycle-coach@gabby-qa-test.example`;
const coachId = await findUserByEmail(coachEmail);
const saId = await findUserByEmail(`${TAG}-lifecycle-student-sa@gabby-qa-test.example`);
const sbId = await findUserByEmail(`${TAG}-lifecycle-student-sb@gabby-qa-test.example`);
const scId = await findUserByEmail(`${TAG}-lifecycle-student-sc@gabby-qa-test.example`);
const sdId = await findUserByEmail(`${TAG}-lifecycle-student-sd@gabby-qa-test.example`);
const seId = await findUserByEmail(`${TAG}-lifecycle-student-se@gabby-qa-test.example`);
const sfId = await findUserByEmail(`${TAG}-lifecycle-student-sf@gabby-qa-test.example`);
const adminEmail = "qa-admin@gabby-qa-test.example";

const coachClient = await signInAsRole(coachEmail, PASSWORD);
const adminClient = await signInAsRole(adminEmail, PASSWORD);
const sdClient = await signInAsRole(`${TAG}-lifecycle-student-sd@gabby-qa-test.example`, PASSWORD);

console.log("対象ユーザー特定完了:", { coachId, saId, sbId, scId, sdId, seId, sfId });

type ScheduleRow = { schedule_id: string; target_sessions: number };
async function getSchedule(coachIdArg: string, studentIdArg: string): Promise<ScheduleRow> {
  const { data, error } = await admin.from("com_m_lesson_schedule").select("schedule_id, target_sessions").eq("coach_id", coachIdArg).eq("student_id", studentIdArg).eq("status", 1).single();
  if (error) throw error;
  return data as ScheduleRow;
}

type ShortfallRow = { expected_sessions: number; actual_sessions: number; shortfall: number };
async function shortfallFor(scheduleId: string): Promise<ShortfallRow> {
  const { data, error } = await admin.rpc("fn_schedule_shortfall", { p_schedule_id: scheduleId }).single();
  if (error) throw error;
  return data as ShortfallRow;
}

/** fn_schedule_shortfallのactual判定式(status IN(1,2) OR (status=3 AND ticket_refunded=false))を
 * TS側で独立に再現し、RPCの返り値と突き合わせる（RPC自体の実装ミスを見逃さないための交差検証）。 */
async function recomputeActual(scheduleId: string): Promise<number> {
  const { data, error } = await admin.from("com_t_session").select("status, ticket_refunded").eq("schedule_id", scheduleId);
  if (error) throw error;
  return (data ?? []).filter((s) => s.status === 1 || s.status === 2 || (s.status === 3 && s.ticket_refunded === false)).length;
}

// ===========================================================================
// 1. target_sessions均等割り・生成上限 (生徒SA: 週3回25セッション → 9/8/8)
// ===========================================================================
console.log("\n--- 1. target_sessions均等割り・生成上限 (生徒SA) ---");
const saSchedules = await admin.from("com_m_lesson_schedule").select("schedule_id, slot_no, target_sessions").eq("coach_id", coachId).eq("student_id", saId).eq("status", 1).order("slot_no", { ascending: true });
if (saSchedules.error) throw saSchedules.error;
const saTargets = (saSchedules.data ?? []).map((s) => s.target_sessions);
check("SA: target_sessionsが週3回25セッションを9/8/8に均等割り(余りはslot_no昇順)している", JSON.stringify(saTargets) === JSON.stringify([9, 8, 8]), JSON.stringify(saTargets));

for (const s of saSchedules.data ?? []) {
  const { count, error } = await admin.from("com_t_session").select("session_id", { count: "exact", head: true }).eq("schedule_id", s.schedule_id).eq("status", 1);
  if (error) throw error;
  check(`SA: slot_no=${s.slot_no}の生成済みセッション数がtarget_sessions(${s.target_sessions})と一致(ライセンス期間が長くても超過生成しない)`, count === s.target_sessions, `generated=${count}`);

  const sf = await shortfallFor(s.schedule_id);
  check(`SA: slot_no=${s.slot_no}のfn_schedule_shortfallはexpected=actual=${s.target_sessions}, shortfall=0`, sf.expected_sessions === s.target_sessions && sf.actual_sessions === s.target_sessions && sf.shortfall === 0, JSON.stringify(sf));
}

// ===========================================================================
// 2. 遅延マッチングによるエンタイトルメント不足の可視化 (生徒SB)
// ===========================================================================
console.log("\n--- 2. 遅延マッチングによるshortfall可視化 (生徒SB) ---");
const sbSchedule = await getSchedule(coachId, sbId);
check("SB: target_sessionsは週2回24セッションの1コマ分=12(マッチングタイミングに関わらず不変)", sbSchedule.target_sessions === 12, `target_sessions=${sbSchedule.target_sessions}`);

const { count: sbActualCount, error: sbCountErr } = await admin.from("com_t_session").select("session_id", { count: "exact", head: true }).eq("schedule_id", sbSchedule.schedule_id).eq("status", 1);
if (sbCountErr) throw sbCountErr;
check("SB: ライセンス残り10日という短い期間のため、実際に生成されたのは2回のみ", sbActualCount === 2, `generated=${sbActualCount}`);

const sbShortfall = await shortfallFor(sbSchedule.schedule_id);
check("SB: fn_schedule_shortfallがexpected=12, actual=2, shortfall=10を正しく検知する(旧実装なら暦週計算でexpectedも2になり検知できなかった)", sbShortfall.expected_sessions === 12 && sbShortfall.actual_sessions === 2 && sbShortfall.shortfall === 10, JSON.stringify(sbShortfall));

// ===========================================================================
// 3. completion_result: finalize_session / resolve_stale_session (生徒SC)
// ===========================================================================
console.log("\n--- 3. completion_result (生徒SC) ---");
const scSchedule = await getSchedule(coachId, scId);
const { data: scSessions, error: scSessionsErr } = await admin.from("com_t_session").select("session_id, start_datetime, status, ticket_id").eq("schedule_id", scSchedule.schedule_id).order("start_datetime", { ascending: true });
if (scSessionsErr) throw scSessionsErr;
const scFuture = (scSessions ?? []).filter((s) => s.status === 1 && new Date(s.start_datetime).getTime() > Date.now());
const scPast = (scSessions ?? []).filter((s) => s.status === 1 && new Date(s.start_datetime).getTime() <= Date.now());
if (scFuture.length < 3 || scPast.length < 2) throw new Error(`生徒SCの前提セッションが揃っていません(future=${scFuture.length}, past=${scPast.length})`);
const scTicketId = scSessions![0].ticket_id as string;

type FinalizeSessionRow = { new_status: number; completion_result: number; overlap_seconds: number; student_joined: boolean };
type MonthlySessionRow = {
  session_id: string;
  completion_result: number | null;
  cancel_category: number | null;
  counts_toward_total: boolean;
  is_attention: boolean;
};

const scNormalSessionId = scFuture[0].session_id;
const scEarlyEndedSessionId = scFuture[1].session_id;
const scNoShowSessionId = scFuture[2].session_id;
const scPastNormalSessionId = scPast[0].session_id;
const scPastEarlySessionId = scPast[1].session_id;

// 3-1. finalize_session: normal (call_logの重複30分)
{
  const { data, error } = await coachClient.rpc("finalize_session", { p_session_id: scNormalSessionId }).single();
  const row = data as FinalizeSessionRow | null;
  check("finalize_session: 30分重複 → completion_result=1(normal)、statusは常に2(completed)", !error && row?.new_status === 2 && row?.completion_result === 1, error?.message ?? JSON.stringify(data));
}

// 3-2. finalize_session: early_ended (10分重複、reason未指定→エラー、指定→成功)
{
  const { error: noReasonError } = await coachClient.rpc("finalize_session", { p_session_id: scEarlyEndedSessionId });
  check("finalize_session: 10分重複でreason未指定だとreason_required相当のエラーになる", !!noReasonError && /reason required/i.test(noReasonError.message), noReasonError?.message);

  const { data, error } = await coachClient.rpc("finalize_session", { p_session_id: scEarlyEndedSessionId, p_early_end_reason: "QA早期終了理由" }).single();
  const finalizeRow = data as FinalizeSessionRow | null;
  check("finalize_session: reason指定で completion_result=2(early_ended)", !error && finalizeRow?.completion_result === 2, error?.message ?? JSON.stringify(data));

  const { data: sessionRow } = await admin.from("com_t_session").select("status_note").eq("session_id", scEarlyEndedSessionId).single();
  check("finalize_session: early_endedのstatus_noteに理由が記録される", sessionRow?.status_note === "QA早期終了理由", sessionRow?.status_note ?? "");
}

// 3-3. finalize_session: no_show (生徒の入室ログなし)
{
  const { data, error } = await coachClient.rpc("finalize_session", { p_session_id: scNoShowSessionId }).single();
  const row = data as FinalizeSessionRow | null;
  check("finalize_session: 生徒の入室記録なし → completion_result=3(no_show)", !error && row?.completion_result === 3, error?.message ?? JSON.stringify(data));
}

// 3-4. resolve_stale_session: normal / early_ended
{
  const { error: emptyReasonError } = await coachClient.rpc("resolve_stale_session", { p_session_id: scPastEarlySessionId, p_completion_result: 2, p_reason: "" });
  check("resolve_stale_session: reason空文字だとエラーになる", !!emptyReasonError, emptyReasonError?.message);

  const { error: normalErr } = await coachClient.rpc("resolve_stale_session", { p_session_id: scPastNormalSessionId, p_completion_result: 1, p_reason: "QAアプリ外実施(normal)" });
  check("resolve_stale_session: completion_result=1(normal)で解決できる", !normalErr, normalErr?.message);
  const { data: normalRow } = await admin.from("com_t_session").select("status, completion_result, status_note").eq("session_id", scPastNormalSessionId).single();
  check(
    "resolve_stale_session: normal解決後、status=2/completion_result=1/status_noteに理由が記録される(resolve_stale_sessionは内訳によらず常にreasonを記録する)",
    normalRow?.status === 2 && normalRow?.completion_result === 1 && normalRow?.status_note === "QAアプリ外実施(normal)",
    JSON.stringify(normalRow)
  );

  const { error: earlyErr } = await coachClient.rpc("resolve_stale_session", { p_session_id: scPastEarlySessionId, p_completion_result: 2, p_reason: "QAアプリ外実施(early_ended)" });
  check("resolve_stale_session: completion_result=2(early_ended)で解決できる", !earlyErr, earlyErr?.message);
}

// 3-5. used_sessions: normalの2件(scNormalSessionId, scPastNormalSessionId)のみ加算されている
{
  const { data: ticket } = await admin.from("com_t_user_session_ticket").select("used_sessions").eq("ticket_id", scTicketId).single();
  check("used_sessions: normal(completion_result=1)の2件分のみ加算され、early_ended/no_showは加算されない(合計2)", ticket?.used_sessions === 2, `used_sessions=${ticket?.used_sessions}`);
}

// 3-6. get_coach_monthly_sessions: completion_result/counts_toward_total/is_attentionの整合性
{
  const monthsNeeded = new Set<string>();
  for (const s of [...scFuture.slice(0, 3), ...scPast.slice(0, 2)]) {
    monthsNeeded.add(new Date(s.start_datetime).toISOString().slice(0, 7) + "-01");
  }
  const rows: MonthlySessionRow[] = [];
  for (const month of monthsNeeded) {
    const { data, error } = await coachClient.rpc("get_coach_monthly_sessions", { p_coach_id: coachId, p_report_month: month });
    if (error) throw error;
    rows.push(...((data ?? []) as MonthlySessionRow[]));
  }
  const byId = new Map(rows.map((r) => [r.session_id, r]));

  const normal = byId.get(scNormalSessionId);
  check("monthly: normalはcompletion_result=1, counts_toward_total=true, is_attention=false", normal?.completion_result === 1 && normal?.counts_toward_total === true && normal?.is_attention === false, JSON.stringify(normal));

  const early = byId.get(scEarlyEndedSessionId);
  check("monthly: early_endedはcompletion_result=2, counts_toward_total=true, is_attention=true", early?.completion_result === 2 && early?.counts_toward_total === true && early?.is_attention === true, JSON.stringify(early));

  const noShow = byId.get(scNoShowSessionId);
  check("monthly: no_showはcompletion_result=3, counts_toward_total=true, is_attention=true", noShow?.completion_result === 3 && noShow?.counts_toward_total === true && noShow?.is_attention === true, JSON.stringify(noShow));
}

// ===========================================================================
// 4. cancel_category: cancel_session / admin_reschedule_session (生徒SD)
// ===========================================================================
console.log("\n--- 4. cancel_category (生徒SD) ---");
const sdSchedule = await getSchedule(coachId, sdId);
const { data: sdSessions, error: sdSessionsErr } = await admin.from("com_t_session").select("session_id, start_datetime, status").eq("schedule_id", sdSchedule.schedule_id).eq("status", 1).order("start_datetime", { ascending: true });
if (sdSessionsErr) throw sdSessionsErr;
if ((sdSessions ?? []).length < 6) throw new Error(`生徒SDの前提セッションが揃っていません(${(sdSessions ?? []).length}件)`);

// 開始まで12時間未満の枠(seed.tsで直接投入した1件)を特定する
const nowMs = Date.now();
const nearSession = sdSessions!.find((s) => new Date(s.start_datetime).getTime() - nowMs < 12 * 60 * 60 * 1000);
const farSessions = sdSessions!.filter((s) => s.session_id !== nearSession?.session_id);
if (!nearSession || farSessions.length < 5) throw new Error("生徒SDの12時間以内/以上の枠を判別できませんでした");

const sdStudentCancelFar = farSessions[0].session_id;
const sdCoachCancel = farSessions[1].session_id;
const sdAdminReschedule = farSessions[2].session_id;
const sdAdminCancelRefundTrue = farSessions[3].session_id;
const sdAdminCancelRefundFalse = farSessions[4].session_id;
const sdStudentCancelNear = nearSession.session_id;

// 4-1. 生徒本人キャンセル(12時間以上前) → cancel_category=1(student), ticket_refunded=true
{
  const { error } = await sdClient.rpc("cancel_session", { p_session_id: sdStudentCancelFar, p_reason: "QA生徒キャンセル(12h以上前)" });
  check("cancel_session: 生徒本人・12時間以上前キャンセルが成功する", !error, error?.message);
  const { data: row } = await admin.from("com_t_session").select("status, cancel_category, ticket_refunded").eq("session_id", sdStudentCancelFar).single();
  check("cancel_session: 12時間以上前は cancel_category=1(student), ticket_refunded=true", row?.status === 3 && row?.cancel_category === 1 && row?.ticket_refunded === true, JSON.stringify(row));
}

// 4-2. 生徒本人キャンセル(12時間未満) → ticket_refunded=false
{
  const { error } = await sdClient.rpc("cancel_session", { p_session_id: sdStudentCancelNear, p_reason: "QA生徒キャンセル(12h未満)" });
  check("cancel_session: 生徒本人・12時間未満キャンセルが成功する", !error, error?.message);
  const { data: row } = await admin.from("com_t_session").select("status, cancel_category, ticket_refunded").eq("session_id", sdStudentCancelNear).single();
  check("cancel_session: 12時間未満は cancel_category=1(student), ticket_refunded=false(返還なし)", row?.status === 3 && row?.cancel_category === 1 && row?.ticket_refunded === false, JSON.stringify(row));
}

// 4-3. コーチキャンセル → cancel_category=2(coach), ticket_refunded=常にtrue
{
  const { error } = await coachClient.rpc("cancel_session", { p_session_id: sdCoachCancel, p_reason: "QAコーチキャンセル" });
  check("cancel_session: コーチキャンセルが成功する", !error, error?.message);
  const { data: row } = await admin.from("com_t_session").select("status, cancel_category, ticket_refunded").eq("session_id", sdCoachCancel).single();
  check("cancel_session: コーチキャンセルは cancel_category=2(coach), ticket_refunded=true(時間帯を問わず)", row?.status === 3 && row?.cancel_category === 2 && row?.ticket_refunded === true, JSON.stringify(row));
}

// 4-4. admin_reschedule_session → 旧行はcancel_category=3(admin)、新行はstatus=1でrescheduled_fromを持つ
{
  const original = sdSessions!.find((s) => s.session_id === sdAdminReschedule)!;
  const newStart = new Date(new Date(original.start_datetime).getTime() + 60 * 60 * 1000);
  const newEnd = new Date(newStart.getTime() + 30 * 60 * 1000);
  const { data: newSessionId, error } = await adminClient.rpc("admin_reschedule_session", {
    p_session_id: sdAdminReschedule,
    p_new_start_datetime: newStart.toISOString(),
    p_new_end_datetime: newEnd.toISOString(),
    p_reason: "QAアドミン日時変更",
  });
  check("admin_reschedule_session: アドミンによる日時変更が成功する", !error, error?.message);

  const { data: oldRow } = await admin.from("com_t_session").select("status, cancel_category, cancel_reason").eq("session_id", sdAdminReschedule).single();
  check("admin_reschedule_session: 旧セッション行は status=3, cancel_category=3(admin)", oldRow?.status === 3 && oldRow?.cancel_category === 3, JSON.stringify(oldRow));

  const { data: newRow } = await admin.from("com_t_session").select("status, rescheduled_from").eq("session_id", newSessionId as string).single();
  check("admin_reschedule_session: 新セッション行は status=1 かつ rescheduled_fromで旧行を参照する", newRow?.status === 1 && newRow?.rescheduled_from === sdAdminReschedule, JSON.stringify(newRow));
}

// 4-5. アドミン代理キャンセル: 返還あり/なしを明示指定
{
  const { error: errTrue } = await adminClient.rpc("cancel_session", { p_session_id: sdAdminCancelRefundTrue, p_reason: "QAアドミン代理(返還あり)", p_admin_refund_ticket: true });
  check("cancel_session: アドミン代理・返還ありが成功する", !errTrue, errTrue?.message);
  const { data: rowTrue } = await admin.from("com_t_session").select("status, cancel_category, ticket_refunded").eq("session_id", sdAdminCancelRefundTrue).single();
  check("cancel_session: アドミン代理は cancel_category=3(admin)、返還可否は明示指定どおりtrue", rowTrue?.status === 3 && rowTrue?.cancel_category === 3 && rowTrue?.ticket_refunded === true, JSON.stringify(rowTrue));

  const { error: errFalse } = await adminClient.rpc("cancel_session", { p_session_id: sdAdminCancelRefundFalse, p_reason: "QAアドミン代理(返還なし)", p_admin_refund_ticket: false });
  check("cancel_session: アドミン代理・返還なしが成功する", !errFalse, errFalse?.message);
  const { data: rowFalse } = await admin.from("com_t_session").select("status, cancel_category, ticket_refunded").eq("session_id", sdAdminCancelRefundFalse).single();
  check("cancel_session: アドミン代理は cancel_category=3(admin)、返還可否は明示指定どおりfalse", rowFalse?.status === 3 && rowFalse?.cancel_category === 3 && rowFalse?.ticket_refunded === false, JSON.stringify(rowFalse));
}

// 4-6. fn_schedule_shortfallの実装をTS側で独立に再現し、RPCの返り値と突き合わせる
{
  const sf = await shortfallFor(sdSchedule.schedule_id);
  const recomputed = await recomputeActual(sdSchedule.schedule_id);
  check("fn_schedule_shortfall: 複数キャンセル種別が混在する状況でも、RPCのactualが独立再現した集計値と一致する", sf.actual_sessions === recomputed, `rpc=${sf.actual_sessions}, recomputed=${recomputed}`);
}

// 4-7. get_coach_monthly_sessions: 12時間未満キャンセル(返還なし)はcounts_toward_total=true/is_attention=true
{
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const { data, error } = await coachClient.rpc("get_coach_monthly_sessions", { p_coach_id: coachId, p_report_month: month });
  if (error) throw error;
  const monthRows = (data ?? []) as MonthlySessionRow[];
  const row = monthRows.find((r) => r.session_id === sdStudentCancelNear);
  check(
    "monthly: 生徒都合12時間以内キャンセル(返還なし)は counts_toward_total=true, is_attention=true (コーチの稼働実績としてカウント)",
    row?.counts_toward_total === true && row?.is_attention === true && row?.cancel_category === 1,
    JSON.stringify(row)
  );

  const farRow = monthRows.find((r) => r.session_id === sdStudentCancelFar);
  check(
    "monthly: 生徒都合12時間以上前キャンセル(返還あり)は counts_toward_total=false (コーチの稼働実績にカウントしない)",
    !farRow || farRow.counts_toward_total === false,
    JSON.stringify(farRow ?? "(対象月の一覧に含まれない=対象外として正しい)")
  );
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

// ---------------------------------------------------------------------------
console.log("\n=== 検証結果 ===");
console.table(checks.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail ?? "" })));

await coachClient.auth.signOut();
await adminClient.auth.signOut();
await sdClient.auth.signOut();

const log = writeResultLog({
  scenario: "features/branches/feature-20260911-dev/session-lifecycle-refactor.feature",
  env,
  tag: TAG,
  checks,
});

console.log(`\n検証完了後は session-lifecycle-refactor-cleanup.ts を同じ --env / --tag で実行し、テストデータを削除してください。`);

if (!log.ok) {
  console.error(`\nNG: ${log.failed}件の不整合`);
  process.exit(1);
} else {
  console.log(`\nOK: 全${log.totalChecks}件のチェックに合格`);
}
