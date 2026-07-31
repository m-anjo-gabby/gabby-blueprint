'use server';

import { getMyProfileCore } from '@gabby/lib/profile/actions/profileActions';
import { uploadProfileIconCore, removeProfileIconCore } from '@gabby/lib/profile/actions/profileIconActions';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { ProfileIconErrorCode, MyProfile } from '@gabby/types/profile';

const logger = createLogger('coach');

const ERROR_MESSAGES_EN: Record<ProfileIconErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  no_file: 'No file was selected.',
  file_too_large: 'The file size must be 5MB or less.',
  invalid_mime_type: 'Only PNG, JPEG, or WebP images are supported.',
  upload_failed: 'Failed to upload the image.',
  db_update_failed: 'Failed to update your profile.',
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
