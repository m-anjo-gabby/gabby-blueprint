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
  CoachSessionTasksSummary,
  ConductedVia,
  IncomingRescheduleProposalGroup,
  ProposedSlotInput,
  SessionActionErrorCode,
  SessionListItem,
  SessionOutcome,
  SessionOutcomeEvidence,
  SessionResultSummary,
} from '@gabby/types/session';
import { IncomingSessionBookingRequestItem } from '@gabby/types/coachInbox';

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
 * Fetches the current coach's sessions within a date range (used by the calendar view)
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
 * Cancels an upcoming session. As the coach, up to 3 proposed alternative times can be
 * attached at the same time (decision authority still rests with the student — these are
 * only suggestions; the student books via acceptRescheduleProposal or their own self-serve flow).
 */
export async function cancelSession(
  sessionId: string,
  reason?: string,
  proposedSlots?: ProposedSlotInput[],
): Promise<{ success: true } | { success: false; message: string }> {
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
 * "End Session": records the outcome the coach reports. The call log is only used as a
 * suggestion (see getSessionOutcomeEvidence) — the coach's choice is what gets recorded.
 * `conductedVia` is required for completed / left-early / no-show outcomes and ignored otherwise.
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
 * Suggested outcome and the evidence behind it (who joined the in-app call, and for how long
 * the coach and student were connected together). Fetched when the End Session dialog opens.
 */
export async function getSessionOutcomeEvidence(
  sessionId: string,
): Promise<{ success: true; evidence: SessionOutcomeEvidence } | { success: false; message: string }> {
  const result = await getSessionOutcomeEvidenceCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_session_outcome_evidence_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, evidence: result.evidence };
}

/**
 * Fetches the session result screen's summary data (status, notes, join/leave timeline).
 */
export async function getSessionResultSummary(
  sessionId: string,
): Promise<{ success: true; session: SessionResultSummary } | { success: false; message: string }> {
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
 * Fetches the dashboard's "Session Tasks" data: sessions past their scheduled end time that
 * still need End Session, recently finalized sessions missing homework, and live
 * session shortfalls across all of this coach's students (makeup sessions to book).
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
 * Checks whether the coach or the student already has a scheduled session at the given
 * time (used for inline validation while picking a proposed alternative time).
 */
export async function checkSessionConflict(
  coachId: string,
  studentId: string,
  startIso: string,
  endIso: string,
  excludeSessionId?: string,
): Promise<{ success: true; coachConflict: boolean; studentConflict: boolean } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await checkSessionConflictCore(coachId, studentId, startIso, endIso, excludeSessionId);

  if (!result.success) {
    logger.error('coach:check_session_conflict_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  return { success: true, coachConflict: result.coachConflict, studentConflict: result.studentConflict };
}

/**
 * Approves a student's session booking request, creating the confirmed session.
 */
export async function approveSessionBookingRequest(
  requestId: string,
): Promise<{ success: true; newSessionId: string } | { success: false; message: string }> {
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
 * Rejects a student's session booking request. The ticket stays unassigned.
 */
export async function rejectSessionBookingRequest(
  requestId: string,
  reason?: string,
): Promise<{ success: true } | { success: false; message: string }> {
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
 * Accepts one of the candidate times a student proposed when cancelling a session.
 */
export async function acceptRescheduleProposal(
  proposalId: string,
): Promise<{ success: true; newSessionId: string } | { success: false; message: string }> {
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
 * Declines all candidate times a student proposed for one cancelled session at once
 * (candidates are mutually exclusive choices, so rejection applies to the whole group).
 */
export async function declineRescheduleProposals(
  sessionId: string,
): Promise<{ success: true } | { success: false; message: string }> {
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
 * Fetches one page of the coach's session booking request history, ordered newest-first.
 * Pass the previous page's `nextCursor` to fetch the next page; a null `nextCursor`
 * in the result means there is no more history.
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
 * Fetches one page of the coach's reschedule proposal history (grouped by the
 * cancelled session), ordered newest-first. Pass the previous page's `nextCursor`
 * to fetch the next page; a null `nextCursor` in the result means there is no more history.
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
