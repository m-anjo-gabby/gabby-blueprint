'use server';

import {
  getMySessionsCore,
  cancelSessionCore,
  rescheduleSessionCore,
  finalizeSessionCore,
  resolveStaleSessionCore,
  getSessionResultSummaryCore,
} from '@gabby/lib/session/actions/sessionActions';
import { getSessionCallLogPresenceCore } from '@gabby/lib/liveSessionRoom/actions/liveSessionRoomActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { SessionActionErrorCode, SessionListItem, SessionResultSummary, SessionStatus } from '@gabby/types/session';

const logger = createLogger('coach');

const SESSION_ERROR_MESSAGES_EN: Record<SessionActionErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  invalid_input: 'Please check the date and time you selected.',
  not_found: 'This session could not be found.',
  not_actionable: 'This session can no longer be changed (it may have already started or been resolved).',
  slot_unavailable: 'The selected time is outside your declared availability.',
  schedule_conflict: 'The selected time conflicts with another scheduled session.',
  reason_required: 'Please provide a reason.',
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
 * Cancels an upcoming session
 */
export async function cancelSession(
  sessionId: string,
  reason?: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await cancelSessionCore(sessionId, reason);

  if (!result.success) {
    logger.error('coach:cancel_session_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:cancel_session_success', 'Session cancelled', ctx);
  return { success: true };
}

/**
 * Reschedules an upcoming session to a new date/time within the coach's own availability
 */
export async function rescheduleSession(
  sessionId: string,
  newDate: string,
  newStartTime: string,
  reason?: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await rescheduleSessionCore(sessionId, newDate, newStartTime, reason);

  if (!result.success) {
    logger.error('coach:reschedule_session_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:reschedule_session_success', 'Session rescheduled', ctx);
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
