'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  HOMEWORK_ATTACHMENT_ALLOWED_MIME_TYPES,
  HOMEWORK_ATTACHMENT_MAX_SIZE,
  PendingHomeworkAttachment,
} from '@gabby/types/sessionHomework';

const logger = createLogger('common');

/**
 * 宿題添付ファイルのアップロード（Storage "homework" バケット）
 * 保存先: homework/{sessionId}/{uuid}_{ファイル名}
 * アップロード権限は「対象session_idの担当コーチ本人であること」で判定する
 * （packages/lib/chat/actions/attachmentActions.tsのuploadChatAttachmentと同型）。
 */
export async function uploadSessionHomeworkAttachment(
  sessionId: string,
  formData: FormData
): Promise<{ success: boolean; attachment?: PendingHomeworkAttachment; message?: string }> {
  const ctx = await getLogContext();
  try {
    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, message: 'ファイルが選択されていません' };
    }

    if (file.size > HOMEWORK_ATTACHMENT_MAX_SIZE) {
      return { success: false, message: 'ファイルサイズは10MBまでです' };
    }

    const mimeType = file.type || 'application/octet-stream';
    if (!HOMEWORK_ATTACHMENT_ALLOWED_MIME_TYPES.includes(mimeType as (typeof HOMEWORK_ATTACHMENT_ALLOWED_MIME_TYPES)[number])) {
      return { success: false, message: 'サポートされていないファイル形式です' };
    }

    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) return { success: false, message: 'Unauthorized' };

    const { data: session, error: sessionError } = await serverSupabase
      .from('com_t_session')
      .select('coach_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError || !session || session.coach_id !== user.id) {
      return { success: false, message: 'このセッションへの宿題投稿権限がありません' };
    }

    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `homework/${sessionId}/${crypto.randomUUID()}_${cleanFileName}`;

    const adminSupabase = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await adminSupabase.storage
      .from('homework')
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      logger.error('sessionHomework:upload_attachment_failed', uploadError.message, {
        ...ctx,
        payload: { sessionId, fileName: file.name },
      });
      return { success: false, message: `アップロードに失敗しました: ${uploadError.message}` };
    }

    const attachment: PendingHomeworkAttachment = {
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      file_type: mimeType,
    };

    logger.info('sessionHomework:upload_attachment_success', `Attachment uploaded: ${storagePath}`, {
      ...ctx,
      payload: { sessionId, storagePath },
    });

    return { success: true, attachment };
  } catch (err) {
    logger.error('sessionHomework:upload_attachment_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: { sessionId },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 宿題添付ファイルの署名付きURLを取得（"homework"バケットは非公開のため都度発行する）
 */
export async function getSessionHomeworkAttachmentUrl(path: string): Promise<{ url: string | null; error?: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage.from('homework').createSignedUrl(path, 60 * 60);

    if (error || !data?.signedUrl) {
      logger.error('sessionHomework:get_attachment_url_failed', error?.message || 'Failed to generate signed URL', {
        ...ctx,
        payload: { path },
      });
      return { url: null, error: error?.message || 'Failed to generate signed URL' };
    }

    return { url: data.signedUrl };
  } catch (err) {
    logger.error('sessionHomework:get_attachment_url_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: { path },
    });
    return { url: null, error: 'Unexpected error' };
  }
}
