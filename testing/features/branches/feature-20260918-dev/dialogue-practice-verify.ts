/**
 * ダイアログプラクティス刷新（リリースのセクション2〜4・7）の検証。
 *   - 旧マスタからの移行データ（com_m_contents content_type=3 / com_m_dialogue_session）の整合
 *   - セット分類(category_id)と公開範囲(content_scope)の組み合わせ制約が撤廃されていること
 *   - 割当(com_t_dialogue_assignment)・進捗(com_t_dialogue_session_progress)・
 *     オープン履歴(com_t_session_dialogue_log)のRLS（担当コーチ/無関係コーチ/生徒本人/他生徒/アドミン）
 *
 * 固定アカウント（testing/FIXTURES.md）の担当関係 qa-coach-ca-01 ⇔ qa-student-01 を使い、
 * qa-coach-us-01 を「無関係コーチ」、qa-student-02 を「他生徒」とする。各操作は実サインインJWTで行う
 * （RLSが対象のため）。本スクリプトで作成した割当・進捗・履歴・検証用教材は、最後にservice_roleで
 * 削除する（固定アカウントの状態を変えないため）。--keep を付けた場合のみ残す。
 *
 * 使い方:
 *   QA_LIVE_SESSION_TEST_PASSWORD='***' pnpm exec tsx testing/features/branches/feature-20260918-dev/dialogue-practice-verify.ts --env=staging --tag=stg0924
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTestEnv, resolveTestEnvFromArgs } from "../../../helpers/env.ts";
import { createAdminClient, signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import { writeResultLog, type CheckResult } from "../../../helpers/results.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? "auto";
const KEEP = process.argv.includes("--keep");
const PASSWORD = process.env.QA_LIVE_SESSION_TEST_PASSWORD;
if (!PASSWORD) {
  throw new Error("QA_LIVE_SESSION_TEST_PASSWORD が未設定です。実行前に環境変数を設定してください。");
}

const service = await createAdminClient(); // ID解決・移行データ集計・後始末専用
const checks: CheckResult[] = [];
function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK " : "NG "} ${name}${detail ? ` … ${detail}` : ""}`);
}

console.log(`\n=== ダイアログプラクティスの検証: env=${env} tag=${TAG} ===`);

async function userIdOf(email: string): Promise<string> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`固定アカウント ${email} が見つかりません（seed-fixed-accounts.tsを先に実行してください）`);
}

const ids = {
  coach: await userIdOf("qa-coach-ca-01@gabby-qa-test.example"),
  otherCoach: await userIdOf("qa-coach-us-01@gabby-qa-test.example"),
  student: await userIdOf("qa-student-01@gabby-qa-test.example"),
  otherStudent: await userIdOf("qa-student-02@gabby-qa-test.example"),
};

// =============================================================================
// 1. 移行データの整合（service_roleでの集計。読み取りのみ）
// =============================================================================
const { data: sets, error: setsErr } = await service.from("com_m_contents").select("content_id, category_id, content_scope").eq("content_type", 3).eq("delete_flg", "0");
if (setsErr) throw setsErr;
const { data: sessions, error: sessErr } = await service.from("com_m_dialogue_session").select("dialogue_session_id, content_id, session_no, coach_slides_link").eq("delete_flg", "0");
if (sessErr) throw sessErr;

record("移行: ダイアログプラクティスのセット(content_type=3)が存在する", (sets?.length ?? 0) > 0, `${sets?.length ?? 0}セット`);
const noCategory = (sets ?? []).filter((s) => s.category_id === null || ![1, 2, 3, 4].includes(s.category_id as number));
record("移行: 全セットにセット分類(category_id 1〜4)が設定されている", noCategory.length === 0, noCategory.length ? `未設定/不正 ${noCategory.length}件` : undefined);

const sessionsBySet = new Map<string, number[]>();
for (const s of sessions ?? []) sessionsBySet.set(s.content_id as string, [...(sessionsBySet.get(s.content_id as string) ?? []), s.session_no as number]);
const emptySets = (sets ?? []).filter((s) => !sessionsBySet.has(s.content_id as string));
record("移行: 全セットにセッション明細が1件以上ある", emptySets.length === 0, emptySets.length ? `明細なし ${emptySets.length}セット` : `明細 ${sessions?.length ?? 0}件`);
const gapped = [...sessionsBySet.entries()].filter(([, nos]) => {
  const sorted = [...nos].sort((a, b) => a - b);
  return sorted.some((n, i) => n !== i + 1);
});
record("移行: セッション番号がセットごとに1から連番になっている", gapped.length === 0, gapped.length ? `欠番/重複 ${gapped.length}セット` : undefined);
const setIds = new Set((sets ?? []).map((s) => s.content_id as string));
const orphan = (sessions ?? []).filter((s) => !setIds.has(s.content_id as string));
record("移行: 有効なセットに紐づかないセッション明細が無い", orphan.length === 0, orphan.length ? `${orphan.length}件` : undefined);
const noLink = (sessions ?? []).filter((s) => !s.coach_slides_link);
record("移行: 全セッション明細にコーチ用スライドリンクがある", noLink.length === 0, noLink.length ? `リンクなし ${noLink.length}件` : undefined);

// =============================================================================
// 2. セット分類と公開範囲の独立（セクション7: chk_com_m_contents_category_scope の撤廃）
// =============================================================================
// 旧制約では category_id=1(Beginner) は content_scope=0 のみ許容。非公開(9)なら誰にも見えないため検証用に作成できる
const probeName = `【QAテスト】分類/公開範囲独立の検証（${TAG}）`;
const { data: probe, error: probeErr } = await service
  .from("com_m_contents")
  .insert({ content_name: probeName, content_name_en: probeName, content_label: probeName, content_type: 3, category_id: 1, content_scope: 9, seq_no: 999 })
  .select("content_id")
  .single();
record("公開範囲: Beginner(category_id=1)のセットを非公開(content_scope=9)で登録できる（旧制約なら23514）", !probeErr, probeErr ? `${probeErr.code} ${probeErr.message}` : undefined);

// =============================================================================
// 3. 割当・進捗・オープン履歴のRLS
// =============================================================================
const coach = await signInAsRole("qa-coach-ca-01@gabby-qa-test.example", PASSWORD);
const otherCoach = await signInAsRole("qa-coach-us-01@gabby-qa-test.example", PASSWORD);
const student = await signInAsRole("qa-student-01@gabby-qa-test.example", PASSWORD);
const otherStudent = await signInAsRole("qa-student-02@gabby-qa-test.example", PASSWORD);
const adminUser = await signInAsRole("qa-admin@gabby-qa-test.example", PASSWORD);

const createdAssignments: string[] = [];

try {
  if (probe) {
    const { data: hidden } = await coach.from("com_m_contents").select("content_id").eq("content_id", probe.content_id);
    record("公開範囲: 非公開(9)のセットは担当コーチからも見えない", (hidden?.length ?? 0) === 0);
  }

  const { data: visibleSets, error: visErr } = await coach.from("com_m_contents").select("content_id, category_id, content_scope").eq("content_type", 3).eq("delete_flg", "0");
  const commonCount = (sets ?? []).filter((s) => s.content_scope === 0).length;
  record("教材一覧: コーチは共通公開(0)の全セットを参照できる", !visErr && (visibleSets ?? []).filter((s) => s.content_scope === 0).length === commonCount, `visible=${visibleSets?.length ?? 0} common=${commonCount}`);

  // 対象セット（session_no=1,2を持つ共通公開セット）とセッション明細
  const target = (sets ?? []).find((s) => s.content_scope === 0 && (sessionsBySet.get(s.content_id as string)?.length ?? 0) >= 2);
  if (!target) throw new Error("セッション明細を2件以上持つ共通公開セットがありません");
  const contentId = target.content_id as string;
  const [ds1, ds2] = (sessions ?? []).filter((s) => s.content_id === contentId).sort((a, b) => (a.session_no as number) - (b.session_no as number));

  // 担当関係のあるライブセッション（オープン履歴の検証用）
  const { data: liveSession, error: liveErr } = await service.from("com_t_session").select("session_id").eq("coach_id", ids.coach).eq("student_id", ids.student).limit(1).single();
  if (liveErr) throw new Error(`qa-coach-ca-01 ⇔ qa-student-01 のセッションがありません: ${liveErr.message}`);

  // 前回の中断等で残った有効な割当があれば、検証前に解除しておく
  await service.from("com_t_dialogue_assignment").update({ delete_flg: "1" }).eq("student_id", ids.student).eq("content_id", contentId).eq("delete_flg", "0");

  // --- 割当 -----------------------------------------------------------------
  const { data: assigned, error: assignErr } = await coach.from("com_t_dialogue_assignment").insert({ student_id: ids.student, content_id: contentId, assigned_by_coach_id: ids.coach }).select("assignment_id").single();
  record("割当: 担当コーチは担当生徒へセットを割り当てられる", !assignErr && Boolean(assigned), assignErr?.message);
  if (!assigned) throw new Error("割当に失敗したため以降の検証を中止します");
  const assignmentId = assigned.assignment_id as string;
  createdAssignments.push(assignmentId);

  const { error: dupErr } = await coach.from("com_t_dialogue_assignment").insert({ student_id: ids.student, content_id: contentId, assigned_by_coach_id: ids.coach });
  record("割当: 同じ生徒・同じセットの有効な割当は重複登録できない(23505)", dupErr?.code === "23505", dupErr ? dupErr.code : "登録できてしまった");

  const { error: otherCoachAssignErr } = await otherCoach.from("com_t_dialogue_assignment").insert({ student_id: ids.student, content_id: (sets ?? []).find((s) => s.content_id !== contentId)?.content_id, assigned_by_coach_id: ids.otherCoach });
  record("割当: 担当外のコーチは割り当てられない(RLS)", otherCoachAssignErr?.code === "42501", otherCoachAssignErr ? otherCoachAssignErr.code : "登録できてしまった");

  const { error: spoofErr } = await coach.from("com_t_dialogue_assignment").insert({ student_id: ids.student, content_id: (sets ?? []).find((s) => s.content_id !== contentId)?.content_id, assigned_by_coach_id: ids.otherCoach });
  record("割当: 割当者(assigned_by_coach_id)を他コーチに偽装できない(RLS)", spoofErr?.code === "42501", spoofErr ? spoofErr.code : "登録できてしまった");

  const { error: selfAssignErr } = await student.from("com_t_dialogue_assignment").insert({ student_id: ids.student, content_id: (sets ?? []).find((s) => s.content_id !== contentId)?.content_id, assigned_by_coach_id: ids.student });
  record("割当: 生徒本人は自分に割り当てられない(RLS)", selfAssignErr?.code === "42501", selfAssignErr ? selfAssignErr.code : "登録できてしまった");

  const visible = async (client: SupabaseClient, table: string, key: string, id: string) => {
    const { data } = await client.from(table).select(key).eq(key, id);
    return (data?.length ?? 0) > 0;
  };
  record("割当の参照: 生徒本人は見える", await visible(student, "com_t_dialogue_assignment", "assignment_id", assignmentId));
  record("割当の参照: アドミンは見える", await visible(adminUser, "com_t_dialogue_assignment", "assignment_id", assignmentId));
  record("割当の参照: 他生徒には見えない", !(await visible(otherStudent, "com_t_dialogue_assignment", "assignment_id", assignmentId)));
  record("割当の参照: 担当外コーチには見えない", !(await visible(otherCoach, "com_t_dialogue_assignment", "assignment_id", assignmentId)));

  const { data: studentUpd } = await student.from("com_t_dialogue_assignment").update({ delete_flg: "1" }).eq("assignment_id", assignmentId).select("assignment_id");
  record("割当の解除: 生徒本人は解除できない（更新0件）", (studentUpd?.length ?? 0) === 0);

  // --- 進捗 -----------------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const { error: progErr } = await coach.from("com_t_dialogue_session_progress").insert({ assignment_id: assignmentId, dialogue_session_id: ds1.dialogue_session_id, is_completed: true, completed_date: today, notes: `${TAG} 検証メモ`, updated_by_coach_id: ids.coach });
  record("進捗: 担当コーチはセッションの完了・メモを登録できる", !progErr, progErr?.message);

  const { error: otherProgErr } = await otherCoach.from("com_t_dialogue_session_progress").insert({ assignment_id: assignmentId, dialogue_session_id: ds2.dialogue_session_id, is_completed: true, updated_by_coach_id: ids.otherCoach });
  record("進捗: 担当外のコーチは登録できない(RLS)", otherProgErr?.code === "42501", otherProgErr ? otherProgErr.code : "登録できてしまった");

  const { error: spoofProgErr } = await coach.from("com_t_dialogue_session_progress").insert({ assignment_id: assignmentId, dialogue_session_id: ds2.dialogue_session_id, is_completed: true, updated_by_coach_id: ids.otherCoach });
  record("進捗: 更新者(updated_by_coach_id)を他コーチに偽装できない(RLS)", spoofProgErr?.code === "42501", spoofProgErr ? spoofProgErr.code : "登録できてしまった");

  const { error: studentProgErr } = await student.from("com_t_dialogue_session_progress").insert({ assignment_id: assignmentId, dialogue_session_id: ds2.dialogue_session_id, is_completed: true, updated_by_coach_id: ids.student });
  record("進捗: 生徒本人は登録できない(RLS)", studentProgErr?.code === "42501", studentProgErr ? studentProgErr.code : "登録できてしまった");

  const { data: otherCoachUpd } = await otherCoach.from("com_t_dialogue_session_progress").update({ notes: "改ざん" }).eq("assignment_id", assignmentId).select("progress_id");
  record("進捗: 担当外のコーチは既存の進捗を更新できない（更新0件）", (otherCoachUpd?.length ?? 0) === 0);

  const { data: studentProg } = await student.from("com_t_dialogue_session_progress").select("is_completed, notes").eq("assignment_id", assignmentId);
  record("進捗の参照: 生徒本人は自分の進捗（完了・メモ）を見られる", studentProg?.length === 1 && studentProg[0].is_completed === true && studentProg[0].notes === `${TAG} 検証メモ`);
  const { data: otherStudentProg } = await otherStudent.from("com_t_dialogue_session_progress").select("progress_id").eq("assignment_id", assignmentId);
  record("進捗の参照: 他生徒には見えない", (otherStudentProg?.length ?? 0) === 0);

  // --- オープン履歴 ----------------------------------------------------------
  const logRow = { session_id: liveSession.session_id, assignment_id: assignmentId, dialogue_session_id: ds1.dialogue_session_id };
  const { error: logErr } = await coach.from("com_t_session_dialogue_log").insert({ ...logRow, opened_by_coach_id: ids.coach });
  const { error: logErr2 } = await coach.from("com_t_session_dialogue_log").insert({ ...logRow, opened_by_coach_id: ids.coach });
  record("オープン履歴: 担当コーチは自分のセッションで開いた事実を記録でき、同じ教材の再オープンも重複して記録される", !logErr && !logErr2, logErr?.message ?? logErr2?.message);

  const { error: otherLogErr } = await otherCoach.from("com_t_session_dialogue_log").insert({ ...logRow, opened_by_coach_id: ids.otherCoach });
  record("オープン履歴: 担当外のコーチ（セッションのコーチでない）は記録できない(RLS)", otherLogErr?.code === "42501", otherLogErr ? otherLogErr.code : "登録できてしまった");

  const { error: spoofLogErr } = await coach.from("com_t_session_dialogue_log").insert({ ...logRow, opened_by_coach_id: ids.otherCoach });
  record("オープン履歴: 記録者(opened_by_coach_id)を他コーチに偽装できない(RLS)", spoofLogErr?.code === "42501", spoofLogErr ? spoofLogErr.code : "登録できてしまった");

  const { data: studentLogs } = await student.from("com_t_session_dialogue_log").select("log_id").eq("assignment_id", assignmentId);
  record("オープン履歴の参照: 生徒本人は自分のセッションの履歴を見られる（2件）", studentLogs?.length === 2, `${studentLogs?.length ?? 0}件`);
  const { data: otherStudentLogs } = await otherStudent.from("com_t_session_dialogue_log").select("log_id").eq("assignment_id", assignmentId);
  record("オープン履歴の参照: 他生徒には見えない", (otherStudentLogs?.length ?? 0) === 0);

  // --- 解除と再割当 -----------------------------------------------------------
  const { data: unassigned, error: unassignErr } = await coach.from("com_t_dialogue_assignment").update({ delete_flg: "1" }).eq("assignment_id", assignmentId).select("assignment_id");
  record("割当の解除: 担当コーチは解除（論理削除）できる", !unassignErr && unassigned?.length === 1, unassignErr?.message);

  const { data: reassigned, error: reassignErr } = await coach.from("com_t_dialogue_assignment").insert({ student_id: ids.student, content_id: contentId, assigned_by_coach_id: ids.coach }).select("assignment_id").single();
  record("割当: 解除済みのセットは同じ生徒へ再度割り当てられる（部分ユニークインデックス）", !reassignErr && Boolean(reassigned), reassignErr?.message);
  if (reassigned) createdAssignments.push(reassigned.assignment_id as string);
} finally {
  if (KEEP) {
    console.log(`\n--keep 指定のため後始末をスキップしました（割当: ${createdAssignments.join(", ")} / 検証用教材: ${probe?.content_id ?? "-"}）`);
  } else {
    // 進捗・オープン履歴は割当の ON DELETE CASCADE で消える
    if (createdAssignments.length) {
      const { error } = await service.from("com_t_dialogue_assignment").delete().in("assignment_id", createdAssignments);
      if (error) console.error("後始末に失敗しました(割当):", error.message);
    }
    if (probe) {
      const { error } = await service.from("com_m_contents").delete().eq("content_id", probe.content_id);
      if (error) console.error("後始末に失敗しました(検証用教材):", error.message);
    }
    console.log("\n後始末: 本スクリプトで作成した割当・進捗・オープン履歴・検証用教材を削除しました");
  }
  await Promise.all([coach, otherCoach, student, otherStudent, adminUser].map(signOutRole));
}

const log = writeResultLog({ scenario: "dialogue-practice", env, tag: TAG, checks });
console.log(`\n結果: ${log.passed}/${log.totalChecks} OK`);
