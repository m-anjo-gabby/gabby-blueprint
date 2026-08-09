'use server';

import { getMyProfileCore } from '@gabby/lib/profile/actions/profileActions';
import { uploadProfileIconCore, removeProfileIconCore } from '@gabby/lib/profile/actions/profileIconActions';
import { getTimezoneListCore, updateMyTimezoneCore } from '@gabby/lib/profile/actions/timezoneActions';
import { getCountryListCore } from '@gabby/lib/country/actions/countryActions';
import { getMyCoachProfileCore, updateMyCoachProfileCore } from '@gabby/lib/coachProfile/actions/coachProfileActions';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { ProfileIconErrorCode, MyProfile, UpdateTimezoneErrorCode } from '@gabby/types/profile';
import { TimezoneMaster } from '@gabby/types/timezone';
import { CountryMaster } from '@gabby/types/country';
import { CoachProfileErrorCode, CoachProfileFormValues, CoachProfileRecord } from '@gabby/types/coachProfile';

const logger = createLogger('coach');

const COACH_PROFILE_ERROR_MESSAGES_EN: Record<CoachProfileErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  invalid_input: 'Please check the values you entered.',
  db_update_failed: 'Failed to update your public profile.',
  unexpected_error: 'An unexpected error occurred.',
};

const ERROR_MESSAGES_EN: Record<ProfileIconErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  no_file: 'No file was selected.',
  file_too_large: 'The file size must be 5MB or less.',
  invalid_mime_type: 'Only PNG, JPEG, or WebP images are supported.',
  upload_failed: 'Failed to upload the image.',
  db_update_failed: 'Failed to update your profile.',
  unexpected_error: 'An unexpected error occurred.',
};

const TIMEZONE_ERROR_MESSAGES_EN: Record<UpdateTimezoneErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  invalid_timezone: 'The selected timezone is not available.',
  db_update_failed: 'Failed to update your timezone.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * Fetches the current coach's own profile information
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  const result = await getMyProfileCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_my_profile_failed', result.errorCode, ctx);
    return null;
  }
  return result.profile;
}

/**
 * Uploads a new profile icon image
 */
export async function uploadProfileIcon(
  formData: FormData
): Promise<{ success: true; iconPath: string } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await uploadProfileIconCore(formData);

  if (!result.success) {
    logger.error('coach:upload_profile_icon_failed', result.errorCode, ctx);
    return { success: false, message: ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:upload_profile_icon_success', 'Coach profile icon updated', ctx);
  return { success: true, iconPath: result.iconPath };
}

/**
 * Removes the current profile icon image
 */
export async function removeProfileIcon(): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await removeProfileIconCore();

  if (!result.success) {
    logger.error('coach:remove_profile_icon_failed', result.errorCode, ctx);
    return { success: false, message: ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:remove_profile_icon_success', 'Coach profile icon removed', ctx);
  return { success: true };
}

/**
 * Fetches the selectable timezone list
 */
export async function getTimezoneList(): Promise<TimezoneMaster[]> {
  const result = await getTimezoneListCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_timezone_list_failed', result.errorCode, ctx);
    return [];
  }
  return result.timezones;
}

/**
 * Updates the current coach's own timezone
 */
export async function updateMyTimezone(
  timezone: string
): Promise<{ success: true; timezone: string } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await updateMyTimezoneCore(timezone);

  if (!result.success) {
    logger.error('coach:update_timezone_failed', result.errorCode, ctx);
    return { success: false, message: TIMEZONE_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:update_timezone_success', `Coach timezone updated: ${result.timezone}`, ctx);
  return { success: true, timezone: result.timezone };
}

/**
 * Fetches the selectable country (nationality) list
 */
export async function getCountryList(): Promise<CountryMaster[]> {
  const result = await getCountryListCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_country_list_failed', result.errorCode, ctx);
    return [];
  }
  return result.countries;
}

/**
 * Fetches the current coach's own public profile (visible to students)
 */
export async function getMyCoachProfile(): Promise<CoachProfileRecord | null> {
  const result = await getMyCoachProfileCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_my_coach_profile_failed', result.errorCode, ctx);
    return null;
  }
  return result.profile;
}

/**
 * Updates the current coach's own public profile
 */
export async function updateMyCoachProfile(
  values: CoachProfileFormValues
): Promise<{ success: true; profile: CoachProfileRecord } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await updateMyCoachProfileCore(values);

  if (!result.success) {
    logger.error('coach:update_coach_profile_failed', result.errorCode, ctx);
    return { success: false, message: COACH_PROFILE_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:update_coach_profile_success', 'Coach public profile updated', ctx);
  return { success: true, profile: result.profile };
}
