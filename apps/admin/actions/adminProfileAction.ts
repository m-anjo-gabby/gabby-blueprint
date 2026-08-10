'use server';

import { getMyProfileCore } from '@gabby/lib/profile/actions/profileActions';
import { uploadProfileIconCore, removeProfileIconCore } from '@gabby/lib/profile/actions/profileIconActions';
import { getTimezoneListCore, updateMyTimezoneCore } from '@gabby/lib/profile/actions/timezoneActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { ProfileIconErrorCode, MyProfile, UpdateTimezoneErrorCode } from '@gabby/types/profile';
import { TimezoneMaster } from '@gabby/types/timezone';

const logger = createLogger('admin');

const ERROR_MESSAGES_JA: Record<ProfileIconErrorCode, string> = {
  unauthorized: 'セッションが切れています。再度ログインしてください。',
  no_file: 'ファイルが選択されていません。',
  file_too_large: 'ファイルサイズは5MBまでです。',
  invalid_mime_type: 'PNG・JPEG・WebP形式の画像のみアップロードできます。',
  upload_failed: '画像のアップロードに失敗しました。',
  db_update_failed: 'プロフィールの更新に失敗しました。',
  unexpected_error: '予期せぬエラーが発生しました。',
};

const TIMEZONE_ERROR_MESSAGES_JA: Record<UpdateTimezoneErrorCode, string> = {
  unauthorized: 'セッションが切れています。再度ログインしてください。',
  invalid_timezone: '選択されたタイムゾーンは利用できません。',
  db_update_failed: 'タイムゾーンの更新に失敗しました。',
  unexpected_error: '予期せぬエラーが発生しました。',
};

/**
 * 自分自身のプロフィール情報を取得する
 */
export async function getMyProfile(): Promise<MyProfile | null> {
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
export async function uploadProfileIcon(
  formData: FormData
): Promise<{ success: true; iconPath: string } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await uploadProfileIconCore(formData);

  if (!result.success) {
    logger.error('admin:upload_profile_icon_failed', result.errorCode, ctx);
    return { success: false, message: ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('admin:upload_profile_icon_success', 'Admin profile icon updated', ctx);
  return { success: true, iconPath: result.iconPath };
}

/**
 * プロフィールアイコンの削除
 */
export async function removeProfileIcon(): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await removeProfileIconCore();

  if (!result.success) {
    logger.error('admin:remove_profile_icon_failed', result.errorCode, ctx);
    return { success: false, message: ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('admin:remove_profile_icon_success', 'Admin profile icon removed', ctx);
  return { success: true };
}

/**
 * タイムゾーン選択肢一覧の取得
 */
export async function getTimezoneList(): Promise<TimezoneMaster[]> {
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
export async function updateMyTimezone(
  timezone: string
): Promise<{ success: true; timezone: string } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await updateMyTimezoneCore(timezone);

  if (!result.success) {
    logger.error('admin:update_timezone_failed', result.errorCode, ctx);
    return { success: false, message: TIMEZONE_ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('admin:update_timezone_success', `Admin timezone updated: ${result.timezone}`, ctx);
  return { success: true, timezone: result.timezone };
}
