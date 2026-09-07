'use server';

import {
  getIncomingRequestsAsCoachCore,
  approveMatchingRequestCore,
  rejectMatchingRequestCore,
} from '@gabby/lib/matching/actions/matchingActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { IncomingMatchingRequestItem, MatchingRequestErrorCode } from '@gabby/types/matching';

const logger = createLogger('coach');

const MATCHING_ERROR_MESSAGES_EN: Record<MatchingRequestErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  invalid_input: 'Please check the values you entered.',
  not_eligible: 'This request is no longer valid.',
  slot_already_requested: 'This slot has already been matched or has a pending request.',
  schedule_conflict: 'This request overlaps with one of your existing schedules. Please reject it and coordinate an alternative time with the student individually.',
  db_insert_failed: 'Failed to save the request.',
  db_update_failed: 'Failed to update the request. It may have already been responded to.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * Fetches matching requests sent to the current coach
 */
export async function getIncomingRequests(): Promise<IncomingMatchingRequestItem[]> {
  const result = await getIncomingRequestsAsCoachCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_incoming_requests_failed', result.errorCode, ctx);
    return [];
  }
  return result.requests;
}

/**
 * Approves a matching request. This automatically creates the recurring
 * lesson schedule and generates all individual sessions for the license period.
 */
export async function approveMatchingRequest(
  requestId: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await approveMatchingRequestCore(requestId);

  if (!result.success) {
    logger.error('coach:approve_matching_request_failed', result.errorCode, ctx);
    return { success: false, message: MATCHING_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:approve_matching_request_success', 'Matching request approved', ctx);
  return { success: true };
}

/**
 * Rejects a matching request with a required reason
 */
export async function rejectMatchingRequest(
  requestId: string,
  reason: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await rejectMatchingRequestCore(requestId, reason);

  if (!result.success) {
    logger.error('coach:reject_matching_request_failed', result.errorCode, ctx);
    return { success: false, message: MATCHING_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:reject_matching_request_success', 'Matching request rejected', ctx);
  return { success: true };
}
