'use server';

import {
  getMyAvailabilityCore,
  addAvailabilityCore,
  deleteAvailabilityCore,
  getMyAvailabilityConfirmedAtCore,
  confirmMyAvailabilityCore,
} from '@gabby/lib/coachAvailability/actions/coachAvailabilityActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  CoachAvailabilityErrorCode,
  CoachAvailabilityFormValues,
  CoachAvailabilitySlot,
} from '@gabby/types/coachAvailability';

const logger = createLogger('coach');

const AVAILABILITY_ERROR_MESSAGES_EN: Record<CoachAvailabilityErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  invalid_input: 'Please check the day and time you entered (end time must be after start time).',
  db_insert_failed: 'Failed to add the availability slot.',
  db_delete_failed: 'Failed to remove the availability slot.',
  db_update_failed: 'Failed to confirm your availability.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * Fetches the current coach's own weekly availability slots
 */
export async function getMyAvailability(): Promise<CoachAvailabilitySlot[]> {
  const result = await getMyAvailabilityCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_my_availability_failed', result.errorCode, ctx);
    return [];
  }
  return result.slots;
}

/**
 * Adds a new weekly availability slot
 */
export async function addAvailability(
  values: CoachAvailabilityFormValues
): Promise<{ success: true; slot: CoachAvailabilitySlot } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await addAvailabilityCore(values);

  if (!result.success) {
    logger.error('coach:add_availability_failed', result.errorCode, ctx);
    return { success: false, message: AVAILABILITY_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:add_availability_success', 'Coach availability slot added', ctx);
  return { success: true, slot: result.slot };
}

/**
 * Removes an availability slot
 */
export async function deleteAvailability(
  availabilityId: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await deleteAvailabilityCore(availabilityId);

  if (!result.success) {
    logger.error('coach:delete_availability_failed', result.errorCode, ctx);
    return { success: false, message: AVAILABILITY_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:delete_availability_success', 'Coach availability slot removed', ctx);
  return { success: true };
}

/**
 * Fetches when the current coach last confirmed their availability (null if never)
 */
export async function getMyAvailabilityConfirmedAt(): Promise<string | null> {
  const result = await getMyAvailabilityConfirmedAtCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_availability_confirmed_at_failed', result.errorCode, ctx);
    return null;
  }
  return result.confirmedAt;
}

/**
 * Confirms the current availability without changes (resets the 14-day review reminder)
 */
export async function confirmAvailability(): Promise<{ success: true; confirmedAt: string } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await confirmMyAvailabilityCore();

  if (!result.success) {
    logger.error('coach:confirm_availability_failed', result.errorCode, ctx);
    return { success: false, message: AVAILABILITY_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:confirm_availability_success', 'Coach availability confirmed', ctx);
  return { success: true, confirmedAt: result.confirmedAt };
}
