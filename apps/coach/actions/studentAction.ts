'use server';

import {
  addCoachStudentNoteCore,
  finalizeContractTrainingReportCore,
  forceStageUpStudentCore,
  getAssignedStudentsCore,
  getContractTrainingReportsCore,
  getSelfTrainingWeekSummaryCore,
  getStudentLiveSessionContractsCore,
  getStudentLiveSessionShortfallsCore,
  getStudentNotesCore,
  getStudentOverviewCore,
  getStudentSessionsByTicketCore,
  getStudentUpcomingSessionCore,
  saveContractTrainingReportDraftCore,
  updateStudentSprintLevelCore,
} from '@gabby/lib/coachStudent/actions/coachStudentActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import type { ActionResult } from '@gabby/types/action';
import {
  type AssignedStudentSummary,
  type CoachSessionListItem,
  type CoachStudentErrorCode,
  type CoachStudentNote,
  type ContractTrainingReport,
  type LiveSessionShortfallItem,
  type SelfTrainingWeekSummary,
  type StudentLiveSessionContractSummary,
  type StudentOverviewProfile,
  type StudentSessionHistoryItem,
  type StudentSprintProgress,
} from '@gabby/types/coachStudent';
import { type SprintQuestionType } from '@gabby/types/sprint';

const logger = createLogger('coach');

const COACH_STUDENT_ERROR_MESSAGES_EN: Record<CoachStudentErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have access to this student.',
  invalid_input: 'Please enter a note before saving.',
  already_finalized: 'This report has already been finalized and can no longer be edited.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * ログイン中のコーチが担当している生徒を取得する
 */
export async function getAssignedStudents(): Promise<AssignedStudentSummary[]> {
  const result = await getAssignedStudentsCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_assigned_students_failed', result.errorCode, ctx);
    return [];
  }
  return result.students;
}

/**
 * 生徒の概要の上部（基本の情報とスプリントの進み具合）を1人分取得する
 */
export async function getStudentOverview(
  studentId: string,
): Promise<ActionResult<{ profile: StudentOverviewProfile }>> {
  const result = await getStudentOverviewCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_overview_failed', result.errorCode, ctx);
    return { success: false, message: COACH_STUDENT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, profile: result.profile };
}

/**
 * その生徒がこれまでに持ったライブセッションの契約（チケット）の一覧を取得する
 * （今と過去。ライブセッションのカードの契約の切り替えに使う）。
 */
export async function getStudentLiveSessionContracts(studentId: string): Promise<StudentLiveSessionContractSummary[]> {
  const result = await getStudentLiveSessionContractsCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_live_session_contracts_failed', result.errorCode, ctx);
    return [];
  }
  return result.contracts;
}

/**
 * その契約（チケット）のセッションを、どのコーチが担当したかに関わらずすべて取得する。
 * ライブセッションのカードで、共有・引き継ぎの契約でも、自分の担当分だけでなく
 * カリキュラムの全体を見られるようにするため。
 */
export async function getStudentSessionsByTicket(studentId: string, ticketId: string): Promise<CoachSessionListItem[]> {
  const result = await getStudentSessionsByTicketCore(studentId, ticketId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_sessions_by_ticket_failed', result.errorCode, ctx);
    return [];
  }
  return result.sessions;
}

/**
 * この生徒との次のセッション（予定のままで、まだ終わっていないもの）を取得する
 * （「ライブセッションを始める」「レッスンを終える」がどの session_id を対象にするかを決めるのに使う。
 * 契約ごとのセッションの一覧から求めず、絞り込んだ専用の取得にしている。
 * 長い契約で先のセッションが十分に作られると、その一覧から一番近いセッションが
 * 漏れることがあるため）。
 */
export async function getStudentUpcomingSession(studentId: string): Promise<StudentSessionHistoryItem | null> {
  const result = await getStudentUpcomingSessionCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_upcoming_session_failed', result.errorCode, ctx);
    return null;
  }
  return result.session;
}

/**
 * ライブセッションの不足（契約した回数のうち予定に入れられなかったもの。
 * 多くはライセンスの期間の途中でマッチングの依頼を承認した場合）を、
 * このコーチとその生徒の予定について取得する。
 */
export async function getStudentLiveSessionShortfalls(studentId: string): Promise<LiveSessionShortfallItem[]> {
  const result = await getStudentLiveSessionShortfallsCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_session_shortfalls_failed', result.errorCode, ctx);
    return [];
  }
  return result.shortfalls;
}

/**
 * その生徒についての、このコーチの非公開のメモを取得する
 */
export async function getStudentNotes(studentId: string): Promise<CoachStudentNote[]> {
  const result = await getStudentNotesCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_notes_failed', result.errorCode, ctx);
    return [];
  }
  return result.notes;
}

const DEFAULT_SELF_TRAINING_WEEK_SUMMARY: SelfTrainingWeekSummary = {
  days: 7,
  active_days: 0,
  total_questions: 0,
  total_assessments: 0,
};

/**
 * その生徒の直近 `days` 日の自主トレーニングの要約（実施日数・問題数・発話の評価の回数）を
 * 取得する。セッションの準備・実施の画面で、コーチが画面を離れずに
 * 最近の自主トレーニングを確かめるのに使う。
 */
export async function getSelfTrainingWeekSummary(studentId: string, days = 7): Promise<SelfTrainingWeekSummary> {
  const result = await getSelfTrainingWeekSummaryCore(studentId, days);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_self_training_week_summary_failed', result.errorCode, ctx);
    return DEFAULT_SELF_TRAINING_WEEK_SUMMARY;
  }
  return result.summary;
}

/**
 * その生徒についての、コーチの非公開のメモを足す
 */
export async function addCoachStudentNote(
  studentId: string,
  noteText: string,
): Promise<ActionResult<{ note: CoachStudentNote }>> {
  const result = await addCoachStudentNoteCore(studentId, noteText);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:add_student_note_failed', result.errorCode, ctx);
    return { success: false, message: COACH_STUDENT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, note: result.note };
}

/**
 * その生徒について、ログイン中のコーチが見られるトレーニングレポートをすべて取得する
 * （自分の下書きと、その生徒の担当のコーチの確定したレポート）。
 */
export async function getContractTrainingReports(studentId: string): Promise<ContractTrainingReport[]> {
  const result = await getContractTrainingReportsCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_contract_training_reports_failed', result.errorCode, ctx);
    return [];
  }
  return result.reports;
}

/**
 * ログイン中のコーチの、その契約（チケット）のトレーニングレポートの下書きのコメントを
 * 保存する（作成または更新）
 */
export async function saveContractTrainingReportDraft(
  ticketId: string,
  studentId: string,
  commentText: string,
): Promise<ActionResult<{ report: ContractTrainingReport }>> {
  const result = await saveContractTrainingReportDraftCore(ticketId, studentId, commentText);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:save_contract_training_report_draft_failed', result.errorCode, ctx);
    return { success: false, message: COACH_STUDENT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, report: result.report };
}

/**
 * ログイン中のコーチのトレーニングレポートを確定する。確定した後は編集できない。
 */
export async function finalizeContractTrainingReport(
  reportId: string,
): Promise<ActionResult<{ report: ContractTrainingReport }>> {
  const result = await finalizeContractTrainingReportCore(reportId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:finalize_contract_training_report_failed', result.errorCode, ctx);
    return { success: false, message: COACH_STUDENT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, report: result.report };
}

type UpdateSprintProgressActionResult =
  { success: true; progress: StudentSprintProgress } | { success: false; message: string };

function resolveSprintProgressErrorMessage(errorCode: CoachStudentErrorCode, invalidInputMessage: string): string {
  return errorCode === 'invalid_input' ? invalidInputMessage : COACH_STUDENT_ERROR_MESSAGES_EN[errorCode];
}

/**
 * その生徒の問題種別1つのレベルを上げる（上げるだけで、下げない）
 */
export async function updateStudentSprintLevel(
  studentId: string,
  questionType: SprintQuestionType,
  newLevel: number,
): Promise<UpdateSprintProgressActionResult> {
  const result = await updateStudentSprintLevelCore(studentId, questionType, newLevel);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:update_student_sprint_level_failed', result.errorCode, ctx);
    return {
      success: false,
      message: resolveSprintProgressErrorMessage(
        result.errorCode,
        'Please select a level higher than the current one.',
      ),
    };
  }
  return { success: true, progress: result.progress };
}

/**
 * その生徒のステージを targetStage まで上げる。条件を満たしている問題種別は
 * 今のレベルのまま、満たしていない問題種別は必要な最低のレベルまで上げる。
 */
export async function forceStageUpStudent(
  studentId: string,
  targetStage: number,
): Promise<UpdateSprintProgressActionResult> {
  const result = await forceStageUpStudentCore(studentId, targetStage);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:force_stage_up_student_failed', result.errorCode, ctx);
    return {
      success: false,
      message: resolveSprintProgressErrorMessage(
        result.errorCode,
        'Please select a stage higher than the current one.',
      ),
    };
  }
  return { success: true, progress: result.progress };
}
