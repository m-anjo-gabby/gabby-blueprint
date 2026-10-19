'use server';

import { getTranslations } from 'next-intl/server';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getMyProfileCore } from '@gabby/lib/profile/actions/profileActions';
import { removeProfileIconCore, uploadProfileIconCore } from '@gabby/lib/profile/actions/profileIconActions';
import { getTimezoneListCore, updateMyTimezoneCore } from '@gabby/lib/profile/actions/timezoneActions';
import type { ActionResult } from '@gabby/types/action';
import { type MyProfile, type ProfileIconErrorCode, type UpdateTimezoneErrorCode } from '@gabby/types/profile';
import { type TimezoneMaster } from '@gabby/types/timezone';
import type { MessageKey } from '@/i18n/types';
import { ADMIN_OR_CONTENT_MANAGER, requireAdminRole } from '@/lib/adminAuth';

const logger = createLogger('admin');

const ICON_ERROR_KEYS = {
  unauthorized: 'common.errors.sessionExpired',
  no_file: 'common.errors.fileRequired',
  file_too_large: 'profile.errors.fileTooLarge',
  invalid_mime_type: 'profile.errors.invalidImageType',
  upload_failed: 'profile.errors.iconUploadFailed',
  db_update_failed: 'profile.errors.profileUpdateFailed',
  unexpected_error: 'common.errors.unexpected',
} as const satisfies Record<ProfileIconErrorCode, MessageKey>;

const TIMEZONE_ERROR_KEYS = {
  unauthorized: 'common.errors.sessionExpired',
  invalid_timezone: 'profile.errors.timezoneUnavailable',
  db_update_failed: 'profile.errors.timezoneUpdateFailed',
  unexpected_error: 'common.errors.unexpected',
} as const satisfies Record<UpdateTimezoneErrorCode, MessageKey>;

/**
 * 自分自身のプロフィール情報を取得する
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const result = await getMyProfileCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('admin:get_my_profile_failed', result.errorCode, ctx);
    return null;
  }
  return result.profile;
}

/**
 * プロフィールアイコンのアップロード
 */
export async function uploadProfileIcon(formData: FormData): Promise<ActionResult<{ iconPath: string }>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  const result = await uploadProfileIconCore(formData);

  if (!result.success) {
    logger.error('admin:upload_profile_icon_failed', result.errorCode, ctx);
    return { success: false, message: (await getTranslations())(ICON_ERROR_KEYS[result.errorCode]) };
  }

  logger.info('admin:upload_profile_icon_success', 'Admin profile icon updated', ctx);
  return { success: true, iconPath: result.iconPath };
}

/**
 * プロフィールアイコンの削除
 */
export async function removeProfileIcon(): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  const result = await removeProfileIconCore();

  if (!result.success) {
    logger.error('admin:remove_profile_icon_failed', result.errorCode, ctx);
    return { success: false, message: (await getTranslations())(ICON_ERROR_KEYS[result.errorCode]) };
  }

  logger.info('admin:remove_profile_icon_success', 'Admin profile icon removed', ctx);
  return { success: true };
}

/**
 * タイムゾーン選択肢一覧の取得
 */
export async function getTimezoneList(): Promise<TimezoneMaster[]> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const result = await getTimezoneListCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('admin:get_timezone_list_failed', result.errorCode, ctx);
    return [];
  }
  return result.timezones;
}

/**
 * 自分自身のタイムゾーンの更新
 */
export async function updateMyTimezone(timezone: string): Promise<ActionResult<{ timezone: string }>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  const result = await updateMyTimezoneCore(timezone);

  if (!result.success) {
    logger.error('admin:update_timezone_failed', result.errorCode, ctx);
    return { success: false, message: (await getTranslations())(TIMEZONE_ERROR_KEYS[result.errorCode]) };
  }

  logger.info('admin:update_timezone_success', `Admin timezone updated: ${result.timezone}`, ctx);
  return { success: true, timezone: result.timezone };
}
