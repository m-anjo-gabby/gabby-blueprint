'use server';

import {
  getMySessionsCore,
  cancelSessionCore,
  rescheduleSessionCore,
} from '@gabby/lib/session/actions/sessionActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { SessionActionErrorCode, SessionListItem } from '@gabby/types/session';

const logger = createLogger('coach');

const SESSION_ERROR_MESSAGES_EN: Record<SessionActionErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  invalid_input: 'Please check the date and time you selected.',
  not_found: 'This session could not be found.',
  not_actionable: 'This session can no longer be changed (it may have already started or been resolved).',
  slot_unavailable: 'The selected time is outside your declared availability.',
  schedule_conflict: 'The selected time conflicts with another scheduled session.',
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
