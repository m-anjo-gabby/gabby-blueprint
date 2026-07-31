'use server';

import { getMyProfileCore } from '@gabby/lib/profile/actions/profileActions';
import { uploadProfileIconCore, removeProfileIconCore } from '@gabby/lib/profile/actions/profileIconActions';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { ProfileIconErrorCode, MyProfile } from '@gabby/types/profile';

const logger = createLogger('student');

const ERROR_MESSAGES_JA: Record<ProfileIconErrorCode, string> = {
  unauthorized: 'セッションが切れています。再度ログインしてください。',
  no_file: 'ファイルが選択されていません。',
  file_too_large: 'ファイルサイズは5MBまでです。',
  invalid_mime_type: 'PNG・JPEG・WebP形式の画像のみアップロードできます。',
  upload_failed: '画像のアップロードに失敗しました。',
  db_update_failed: 'プロフィールの更新に失敗しました。',
  unexpected_error: '予期せぬエラーが発生しました。',
};

/**
 * 自分自身のプロフィール情報を取得する
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  const result = await getMyProfileCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_my_profile_failed', result.errorCode, ctx);
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
    logger.error('student:upload_profile_icon_failed', result.errorCode, ctx);
    return { success: false, message: ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:upload_profile_icon_success', 'Student profile icon updated', ctx);
  return { success: true, iconPath: result.iconPath };
}

/**
 * プロフィールアイコンの削除
 */
export async function removeProfileIcon(): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await removeProfileIconCore();

  if (!result.success) {
    logger.error('student:remove_profile_icon_failed', result.errorCode, ctx);
    return { success: false, message: ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:remove_profile_icon_success', 'Student profile icon removed', ctx);
  return { success: true };
}
