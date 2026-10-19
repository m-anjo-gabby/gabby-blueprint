'use server';

import {
  getMySessionsCore,
  cancelSessionCore,
  recordSessionOutcomeCore,
  getSessionOutcomeEvidenceCore,
  getSessionResultSummaryCore,
  checkSessionConflictCore,
  approveSessionBookingRequestCore,
  rejectSessionBookingRequestCore,
  acceptRescheduleProposalCore,
  declineRescheduleProposalsCore,
  getBookingRequestHistoryPageForCoachCore,
  getRescheduleProposalHistoryPageForCoachCore,
} from '@gabby/lib/session/actions/sessionActions';
import { getCoachSessionTasksCore } from '@gabby/lib/session/actions/sessionTaskActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  type CoachSessionTasksSummary,
  type ConductedVia,
  type IncomingRescheduleProposalGroup,
  type ProposedSlotInput,
  type SessionActionErrorCode,
  type SessionListItem,
  type SessionOutcome,
  type SessionOutcomeEvidence,
  type SessionResultSummary,
} from '@gabby/types/session';
import { type IncomingSessionBookingRequestItem } from '@gabby/types/coachInbox';
import type { ActionResult } from '@gabby/types/action';

const logger = createLogger('coach');

const SESSION_ERROR_MESSAGES_EN: Record<SessionActionErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  invalid_input: 'Please check the date and time you selected.',
  not_found: 'This could not be found.',
  not_actionable: 'This can no longer be changed (it may not have started yet, or it was already recorded).',
  schedule_conflict: 'The selected time conflicts with another scheduled session.',
  reason_required: 'Please add a note explaining what happened.',
  no_ticket_available: 'No unassigned ticket is available to book.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * ログイン中のコーチの、期間内のセッションを取得する（カレンダーの表示に使う）
 */
export async function getMySessions(startIso: string, endIso: string): Promise<SessionListItem[]> {
  const result = await getMySessionsCore(startIso, endIso);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_my_sessions_failed', result.errorCode, ctx);
    return [];
  }
  return result.sessions;
}

/**
 * これからのセッションをキャンセルする。コーチは振替の候補の日時を3件まで
 * 同時に付けられる（決めるのは生徒で、候補は提案にとどまる。
 * 生徒は acceptRescheduleProposal か自分の予約の流れで予約する）。
 */
export async function cancelSession(
  sessionId: string,
  reason?: string,
  proposedSlots?: ProposedSlotInput[],
): Promise<ActionResult> {
  const ctx = await getLogContext();
  const result = await cancelSessionCore(sessionId, reason, proposedSlots);

  if (!result.success) {
    logger.error('coach:cancel_session_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:cancel_session_success', 'Session cancelled', ctx);
  return { success: true };
}

/**
 * 「セッションの終了」: コーチが申告した結果を記録する。通話の記録は
 * 提案に使うだけで（getSessionOutcomeEvidence）、記録するのはコーチが選んだ結果。
 * `conductedVia` は実施・途中退出・欠席の結果では必須で、それ以外では使わない。
 */
export async function recordSessionOutcome(
  sessionId: string,
  outcome: SessionOutcome,
  conductedVia: ConductedVia | null,
  reason: string,
): Promise<{ success: true } | { success: false; errorCode: SessionActionErrorCode; message: string }> {
  const ctx = await getLogContext();
  const result = await recordSessionOutcomeCore(sessionId, outcome, conductedVia, reason);

  if (!result.success) {
    logger.error('coach:record_session_outcome_failed', result.errorCode, ctx);
    return { success: false, errorCode: result.errorCode, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:record_session_outcome_success', 'Session outcome recorded', ctx);
  return { success: true };
}

/**
 * 提案する結果と、その根拠（アプリ内の通話に誰が入ったか、コーチと生徒が
 * 一緒に何分つながっていたか）。セッションの終了のダイアログを開いた時に取得する。
 */
export async function getSessionOutcomeEvidence(
  sessionId: string,
): Promise<ActionResult<{ evidence: SessionOutcomeEvidence }>> {
  const result = await getSessionOutcomeEvidenceCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_session_outcome_evidence_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, evidence: result.evidence };
}

/**
 * セッションの結果の画面の要約（状態・メモ・入室と退室の時系列）を取得する。
 */
export async function getSessionResultSummary(
  sessionId: string,
): Promise<ActionResult<{ session: SessionResultSummary }>> {
  const result = await getSessionResultSummaryCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_session_result_summary_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, session: result.session };
}

const EMPTY_SESSION_TASKS: CoachSessionTasksSummary = {
  unfinalizedSessions: [],
  missingHomeworkSessions: [],
  shortfalls: [],
};

/**
 * ダッシュボードの「セッションのタスク」を取得する。終了予定を過ぎても
 * セッションの終了をしていないもの、最近終わって宿題の無いもの、
 * このコーチの全生徒のライブセッションの不足（予約する補講）。
 */
export async function getMySessionTasks(): Promise<CoachSessionTasksSummary> {
  const result = await getCoachSessionTasksCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_my_session_tasks_failed', result.errorCode, ctx);
    return EMPTY_SESSION_TASKS;
  }
  return result.tasks;
}

/**
 * コーチか生徒に、その日時にすでに予定のセッションがあるかを確かめる
 * （振替の候補の日時を選ぶ間の、その場の入力の確認に使う）。
 */
export async function checkSessionConflict(
  coachId: string,
  studentId: string,
  startIso: string,
  endIso: string,
  excludeSessionId?: string,
): Promise<ActionResult<{ coachConflict: boolean; studentConflict: boolean }>> {
  const ctx = await getLogContext();
  const result = await checkSessionConflictCore(coachId, studentId, startIso, endIso, excludeSessionId);

  if (!result.success) {
    logger.error('coach:check_session_conflict_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  return { success: true, coachConflict: result.coachConflict, studentConflict: result.studentConflict };
}

/**
 * 生徒のセッションの予約の依頼を承認し、確定したセッションを作る。
 */
export async function approveSessionBookingRequest(requestId: string): Promise<ActionResult<{ newSessionId: string }>> {
  const ctx = await getLogContext();
  const result = await approveSessionBookingRequestCore(requestId);

  if (!result.success) {
    logger.error('coach:approve_booking_request_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:approve_booking_request_success', 'Session booking request approved', ctx);
  return { success: true, newSessionId: result.newSessionId };
}

/**
 * 生徒のセッションの予約の依頼を断る。チケットは割り当てないまま残る。
 */
export async function rejectSessionBookingRequest(requestId: string, reason?: string): Promise<ActionResult> {
  const ctx = await getLogContext();
  const result = await rejectSessionBookingRequestCore(requestId, reason);

  if (!result.success) {
    logger.error('coach:reject_booking_request_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:reject_booking_request_success', 'Session booking request rejected', ctx);
  return { success: true };
}

/**
 * 生徒がセッションのキャンセルの時に出した候補の日時の1つを受ける。
 */
export async function acceptRescheduleProposal(proposalId: string): Promise<ActionResult<{ newSessionId: string }>> {
  const ctx = await getLogContext();
  const result = await acceptRescheduleProposalCore(proposalId);

  if (!result.success) {
    logger.error('coach:accept_reschedule_proposal_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:accept_reschedule_proposal_success', 'Reschedule proposal accepted', ctx);
  return { success: true, newSessionId: result.newSessionId };
}

/**
 * 生徒が1つのキャンセルしたセッションに出した候補の日時を、まとめて断る
 * （候補はどれか1つを選ぶものなので、断る時は全体を断る）。
 */
export async function declineRescheduleProposals(sessionId: string): Promise<ActionResult> {
  const ctx = await getLogContext();
  const result = await declineRescheduleProposalsCore(sessionId);

  if (!result.success) {
    logger.error('coach:decline_reschedule_proposals_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:decline_reschedule_proposals_success', 'Reschedule proposals declined', ctx);
  return { success: true };
}

/**
 * コーチのセッションの予約の依頼の履歴を、新しい順に1ページ分取得する。
 * 次のページは前のページの `nextCursor` を渡して取得する。結果の `nextCursor` が null なら、
 * それより古い履歴は無い。
 */
export async function getBookingRequestHistoryPage(
  cursor: string | null,
  limit: number,
): Promise<{ items: IncomingSessionBookingRequestItem[]; nextCursor: string | null }> {
  const result = await getBookingRequestHistoryPageForCoachCore(cursor, limit);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_booking_request_history_page_failed', result.errorCode, ctx);
    return { items: [], nextCursor: null };
  }
  return { items: result.items, nextCursor: result.nextCursor };
}

/**
 * コーチの振替の候補の履歴を、キャンセルしたセッションごとにまとめて、
 * 新しい順に1ページ分取得する。次のページは前のページの `nextCursor` を渡して取得する。
 * 結果の `nextCursor` が null なら、それより古い履歴は無い。
 */
export async function getRescheduleProposalHistoryPage(
  cursor: string | null,
  limit: number,
): Promise<{ items: IncomingRescheduleProposalGroup[]; nextCursor: string | null }> {
  const result = await getRescheduleProposalHistoryPageForCoachCore(cursor, limit);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_reschedule_proposal_history_page_failed', result.errorCode, ctx);
    return { items: [], nextCursor: null };
  }
  return { items: result.items, nextCursor: result.nextCursor };
}
