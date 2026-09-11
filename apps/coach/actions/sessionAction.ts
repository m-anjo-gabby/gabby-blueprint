'use server';

import {
  getMySessionsCore,
  cancelSessionCore,
  finalizeSessionCore,
  resolveStaleSessionCore,
  getSessionResultSummaryCore,
  checkSessionConflictCore,
  approveSessionBookingRequestCore,
  rejectSessionBookingRequestCore,
  acceptRescheduleProposalCore,
  declineRescheduleProposalsCore,
} from '@gabby/lib/session/actions/sessionActions';
import { getCoachSessionTasksCore } from '@gabby/lib/session/actions/sessionTaskActions';
import { getSessionCallLogPresenceCore } from '@gabby/lib/liveSessionRoom/actions/liveSessionRoomActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  CoachSessionTasksSummary,
  ProposedSlotInput,
  SessionActionErrorCode,
  SessionListItem,
  SessionResultSummary,
  SessionStatus,
} from '@gabby/types/session';

const logger = createLogger('coach');

const SESSION_ERROR_MESSAGES_EN: Record<SessionActionErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  invalid_input: 'Please check the date and time you selected.',
  not_found: 'This could not be found.',
  not_actionable: 'This can no longer be changed (it may have already started or been resolved).',
  schedule_conflict: 'The selected time conflicts with another scheduled session.',
  reason_required: 'Please provide a reason.',
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
  proposedSlots?: ProposedSlotInput[]
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
 * Ends a lesson and lets the server judge its outcome (completed/early-ended/no-show)
 * from the coach's and student's call-log overlap. Omit `reason` first; if the RPC
 * responds with errorCode 'reason_required' (early-ended, <20min overlap with the
 * student present), show a reason prompt and call this again with `reason` filled in.
 */
export async function finalizeSession(
  sessionId: string,
  reason?: string
): Promise<
  | { success: true; status: SessionStatus; overlapSeconds: number }
  | { success: false; errorCode: SessionActionErrorCode; message: string }
> {
  const ctx = await getLogContext();
  const result = await finalizeSessionCore(sessionId, reason);

  if (!result.success) {
    logger.error('coach:finalize_session_failed', result.errorCode, ctx);
    return { success: false, errorCode: result.errorCode, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:finalize_session_success', 'Session finalized', ctx);
  return { success: true, status: result.status, overlapSeconds: result.overlapSeconds };
}

/**
 * Manually resolves a session stuck in "scheduled" past its end time (e.g. the coach
 * crashed before pressing End Lesson, or the lesson was conducted outside the app).
 * `resolvedStatus` must be one of completed(2)/no_show(6)/early_ended(7); a reason is mandatory.
 */
export async function resolveStaleSession(
  sessionId: string,
  resolvedStatus: SessionStatus,
  reason: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await resolveStaleSessionCore(sessionId, resolvedStatus, reason);

  if (!result.success) {
    logger.error('coach:resolve_stale_session_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:resolve_stale_session_success', 'Stale session resolved', ctx);
  return { success: true };
}

/**
 * Fetches the session result screen's summary data (status, notes, join/leave timeline).
 */
export async function getSessionResultSummary(
  sessionId: string
): Promise<{ success: true; session: SessionResultSummary } | { success: false; message: string }> {
  const result = await getSessionResultSummaryCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_session_result_summary_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, session: result.session };
}

/**
 * For a batch of session IDs, reports whether the coach themself has at least one
 * call-log row (i.e. has actually joined the room at least once) — drives the "End
 * Lesson" button's enabled state on the dashboard / student detail panels.
 */
export async function hasCoachJoinedSessions(sessionIds: string[]): Promise<Record<string, boolean>> {
  const result = await getSessionCallLogPresenceCore(sessionIds);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:has_coach_joined_sessions_failed', result.errorCode, ctx);
    return {};
  }
  return result.joinedBySessionId;
}

const EMPTY_SESSION_TASKS: CoachSessionTasksSummary = { unfinalizedSessions: [], missingHomeworkSessions: [], shortfalls: [] };

/**
 * Fetches the dashboard's "Session Tasks" data: sessions past their scheduled end time that
 * still need End Session/Resolve, recently finalized sessions missing homework, and live
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
  excludeSessionId?: string
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
  requestId: string
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
  reason?: string
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
  proposalId: string
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
  sessionId: string
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
