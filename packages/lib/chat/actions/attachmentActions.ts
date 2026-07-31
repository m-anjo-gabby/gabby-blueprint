'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import {
  CHAT_ATTACHMENT_ALLOWED_MIME_TYPES,
  CHAT_ATTACHMENT_MAX_SIZE,
  PendingChatAttachment,
} from '@gabby/types/chat';

const logger = createLogger('common');

/**
 * チャット添付ファイルのアップロード（Storage "chat" バケット）
 * 保存先: chat/{roomId}/{uuid}_{ファイル名}
 * ルーム参加権限はRLS経由でのSELECTにより確認する（is_chat_room_member）。
 */
export async function uploadChatAttachment(
  roomId: string,
  formData: FormData
): Promise<{ success: boolean; attachment?: PendingChatAttachment; message?: string }> {
  const ctx = await getLogContext();
  try {
    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, message: 'ファイルが選択されていません' };
    }

    if (file.size > CHAT_ATTACHMENT_MAX_SIZE) {
      return { success: false, message: 'ファイルサイズは10MBまでです' };
    }

    const mimeType = file.type || 'application/octet-stream';
    if (!CHAT_ATTACHMENT_ALLOWED_MIME_TYPES.includes(mimeType as (typeof CHAT_ATTACHMENT_ALLOWED_MIME_TYPES)[number])) {
      return { success: false, message: 'サポートされていないファイル形式です' };
    }

    // ルーム参加権限の確認（RLS: is_chat_room_member）
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) return { success: false, message: 'Unauthorized' };

    const { data: membership, error: membershipError } = await serverSupabase
      .from('com_t_chat_room_user')
      .select('room_id')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .is('left_at', null)
      .maybeSingle();

    if (membershipError || !membership) {
      return { success: false, message: 'このルームへのアクセス権限がありません' };
    }

    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `chat/${roomId}/${crypto.randomUUID()}_${cleanFileName}`;

    const adminSupabase = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await adminSupabase.storage
      .from('chat')
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      logger.error('chat:upload_attachment_failed', uploadError.message, {
        ...ctx,
        payload: { roomId, fileName: file.name },
      });
      return { success: false, message: `アップロードに失敗しました: ${uploadError.message}` };
    }

    const attachment: PendingChatAttachment = {
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      file_type: mimeType,
    };

    logger.info('chat:upload_attachment_success', `Attachment uploaded: ${storagePath}`, {
      ...ctx,
      payload: { roomId, storagePath },
    });

    return { success: true, attachment };
  } catch (err) {
    logger.error('chat:upload_attachment_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: { roomId },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * チャット添付ファイルの公開URL（署名付きURL）を取得
 * "chat" バケットはPrivate運用のため、有効期限付きの署名URLを返す。
 */
export async function getChatAttachmentUrl(
  path: string
): Promise<{ url: string | null; error?: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage.from('chat').createSignedUrl(path, 60 * 60);

    if (error || !data?.signedUrl) {
      logger.error('chat:get_attachment_url_failed', error?.message || 'Failed to generate signed URL', {
        ...ctx,
        payload: { path },
      });
      return { url: null, error: error?.message || 'Failed to generate signed URL' };
    }

    return { url: data.signedUrl };
  } catch (err) {
    logger.error('chat:get_attachment_url_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: { path },
    });
    return { url: null, error: 'Unexpected error' };
  }
}
