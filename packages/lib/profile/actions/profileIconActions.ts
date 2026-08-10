'use server';

import { createServerClient } from '../../supabase/server';
import { createAdminClient } from '../../supabase/admin';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import {
  PROFILE_ICON_BUCKET,
  PROFILE_ICON_MAX_SIZE,
  PROFILE_ICON_ALLOWED_MIME_TYPES,
  ProfileIconMimeType,
  UploadProfileIconResult,
  RemoveProfileIconResult,
} from '@gabby/types/profile';

const logger = createLogger('common');

// Storage上のファイル拡張子はMIMEタイプから決定する（クライアント側のファイル名は信用しない）
const MIME_EXTENSION_MAP: Record<ProfileIconMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * プロフィールアイコン画像のアップロード（Storage "profile" バケット、ポータル共通）
 * 保存先: profile/{user_id}/icon/{uuid}.{ext}
 * 認証済み本人の com_m_user.icon_path のみを更新する（RLS: id = auth.uid()）。
 */
export async function uploadProfileIconCore(formData: FormData): Promise<UploadProfileIconResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const file = formData.get('file') as File | null;
    if (!file) return { success: false, errorCode: 'no_file' };

    if (file.size > PROFILE_ICON_MAX_SIZE) {
      return { success: false, errorCode: 'file_too_large' };
    }

    const mimeType = file.type as ProfileIconMimeType;
    if (!PROFILE_ICON_ALLOWED_MIME_TYPES.includes(mimeType)) {
      return { success: false, errorCode: 'invalid_mime_type' };
    }

    // 上書き前の旧ファイルパスを取得しておき、DB更新成功後に削除する
    const { data: currentRow } = await supabase
      .from('com_m_user')
      .select('icon_path')
      .eq('id', user.id)
      .single();
    const previousIconPath = currentRow?.icon_path as string | null | undefined;

    const ext = MIME_EXTENSION_MAP[mimeType];
    const newIconPath = `${PROFILE_ICON_BUCKET}/${user.id}/icon/${crypto.randomUUID()}.${ext}`;

    const adminSupabase = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await adminSupabase.storage
      .from(PROFILE_ICON_BUCKET)
      .upload(newIconPath, buffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      logger.error('profile:upload_icon_failed', uploadError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'upload_failed' };
    }

    const { error: updateError } = await supabase
      .from('com_m_user')
      .update({ icon_path: newIconPath, update_date: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      logger.error('profile:update_icon_path_failed', updateError.message, { ...ctx, userId: user.id });
      // DB更新に失敗した場合は、アップロード済みの新ファイルを削除してロールバックする
      await adminSupabase.storage.from(PROFILE_ICON_BUCKET).remove([newIconPath]);
      return { success: false, errorCode: 'db_update_failed' };
    }

    // 旧アイコンファイルの削除（失敗してもアップロード自体は成功扱いとし、ログのみ残す）
    if (previousIconPath) {
      const { error: removeError } = await adminSupabase.storage
        .from(PROFILE_ICON_BUCKET)
        .remove([previousIconPath]);
      if (removeError) {
        logger.warn('profile:remove_previous_icon_failed', removeError.message, { ...ctx, userId: user.id });
      }
    }

    logger.info('profile:upload_icon_success', `Profile icon updated: ${newIconPath}`, { ...ctx, userId: user.id });
    return { success: true, iconPath: newIconPath };
  } catch (err) {
    logger.error('profile:upload_icon_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * プロフィールアイコン画像の削除（ポータル共通）
 */
export async function removeProfileIconCore(): Promise<RemoveProfileIconResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: currentRow } = await supabase
      .from('com_m_user')
      .select('icon_path')
      .eq('id', user.id)
      .single();
    const previousIconPath = currentRow?.icon_path as string | null | undefined;

    if (!previousIconPath) {
      return { success: true };
    }

    const { error: updateError } = await supabase
      .from('com_m_user')
      .update({ icon_path: null, update_date: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      logger.error('profile:remove_icon_db_update_failed', updateError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'db_update_failed' };
    }

    const adminSupabase = createAdminClient();
    const { error: removeError } = await adminSupabase.storage
      .from(PROFILE_ICON_BUCKET)
      .remove([previousIconPath]);
    if (removeError) {
      logger.warn('profile:remove_icon_storage_failed', removeError.message, { ...ctx, userId: user.id });
    }

    logger.info('profile:remove_icon_success', 'Profile icon removed', { ...ctx, userId: user.id });
    return { success: true };
  } catch (err) {
    logger.error('profile:remove_icon_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
