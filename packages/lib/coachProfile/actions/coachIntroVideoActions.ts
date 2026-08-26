'use server';

import { createServerClient } from '../../supabase/server';
import { createAdminClient } from '../../supabase/admin';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { PROFILE_ICON_BUCKET } from '@gabby/types/profile';
import {
  COACH_INTRO_VIDEO_MAX_SIZE,
  COACH_INTRO_VIDEO_ALLOWED_MIME_TYPES,
  CoachIntroVideoMimeType,
  UploadCoachIntroVideoResult,
  RemoveCoachIntroVideoResult,
} from '@gabby/types/coachProfile';

const logger = createLogger('common');

// Storage上のファイル拡張子はMIMEタイプから決定する（クライアント側のファイル名は信用しない）
const MIME_EXTENSION_MAP: Record<CoachIntroVideoMimeType, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/**
 * コーチ紹介ビデオのアップロード（Storage "profile" バケット、アイコン画像と同じバケットを流用）
 * 保存先: profile/{user_id}/video/{uuid}.{ext}
 * 認証済み本人の com_m_coach_profile.intro_video_path のみを更新する（RLS: user_id = auth.uid()）。
 */
export async function uploadCoachIntroVideoCore(formData: FormData): Promise<UploadCoachIntroVideoResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const file = formData.get('file') as File | null;
    if (!file) return { success: false, errorCode: 'no_file' };

    if (file.size > COACH_INTRO_VIDEO_MAX_SIZE) {
      return { success: false, errorCode: 'file_too_large' };
    }

    const mimeType = file.type as CoachIntroVideoMimeType;
    if (!COACH_INTRO_VIDEO_ALLOWED_MIME_TYPES.includes(mimeType)) {
      return { success: false, errorCode: 'invalid_mime_type' };
    }

    // 上書き前の旧ファイルパスを取得しておき、DB更新成功後に削除する
    const { data: currentRow } = await supabase
      .from('com_m_coach_profile')
      .select('intro_video_path')
      .eq('user_id', user.id)
      .single();
    const previousVideoPath = currentRow?.intro_video_path as string | null | undefined;

    const ext = MIME_EXTENSION_MAP[mimeType];
    const newVideoPath = `${PROFILE_ICON_BUCKET}/${user.id}/video/${crypto.randomUUID()}.${ext}`;

    const adminSupabase = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await adminSupabase.storage
      .from(PROFILE_ICON_BUCKET)
      .upload(newVideoPath, buffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      logger.error('coach_profile:upload_intro_video_failed', uploadError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'upload_failed' };
    }

    const { error: updateError } = await supabase
      .from('com_m_coach_profile')
      .update({ intro_video_path: newVideoPath, update_date: new Date().toISOString() })
      .eq('user_id', user.id);

    if (updateError) {
      logger.error('coach_profile:update_intro_video_path_failed', updateError.message, { ...ctx, userId: user.id });
      // DB更新に失敗した場合は、アップロード済みの新ファイルを削除してロールバックする
      await adminSupabase.storage.from(PROFILE_ICON_BUCKET).remove([newVideoPath]);
      return { success: false, errorCode: 'db_update_failed' };
    }

    // 旧ビデオファイルの削除（失敗してもアップロード自体は成功扱いとし、ログのみ残す）
    if (previousVideoPath) {
      const { error: removeError } = await adminSupabase.storage
        .from(PROFILE_ICON_BUCKET)
        .remove([previousVideoPath]);
      if (removeError) {
        logger.warn('coach_profile:remove_previous_intro_video_failed', removeError.message, { ...ctx, userId: user.id });
      }
    }

    logger.info('coach_profile:upload_intro_video_success', `Coach intro video updated: ${newVideoPath}`, { ...ctx, userId: user.id });
    return { success: true, introVideoPath: newVideoPath };
  } catch (err) {
    logger.error('coach_profile:upload_intro_video_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * コーチ紹介ビデオの削除
 */
export async function removeCoachIntroVideoCore(): Promise<RemoveCoachIntroVideoResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: currentRow } = await supabase
      .from('com_m_coach_profile')
      .select('intro_video_path')
      .eq('user_id', user.id)
      .single();
    const previousVideoPath = currentRow?.intro_video_path as string | null | undefined;

    if (!previousVideoPath) {
      return { success: true };
    }

    const { error: updateError } = await supabase
      .from('com_m_coach_profile')
      .update({ intro_video_path: null, update_date: new Date().toISOString() })
      .eq('user_id', user.id);

    if (updateError) {
      logger.error('coach_profile:remove_intro_video_db_update_failed', updateError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'db_update_failed' };
    }

    const adminSupabase = createAdminClient();
    const { error: removeError } = await adminSupabase.storage
      .from(PROFILE_ICON_BUCKET)
      .remove([previousVideoPath]);
    if (removeError) {
      logger.warn('coach_profile:remove_intro_video_storage_failed', removeError.message, { ...ctx, userId: user.id });
    }

    logger.info('coach_profile:remove_intro_video_success', 'Coach intro video removed', { ...ctx, userId: user.id });
    return { success: true };
  } catch (err) {
    logger.error('coach_profile:remove_intro_video_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
