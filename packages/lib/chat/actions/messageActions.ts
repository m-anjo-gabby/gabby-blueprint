'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { USER_TYPES } from '@gabby/types/user';
import { CHAT_MESSAGE_TYPES, ChatAttachmentRecord, ChatMessage, SendChatMessagePayload } from '@gabby/types/chat';
import { getCurrentUserWithType } from './roomActions';

const logger = createLogger('common');

const MESSAGE_SELECT_WITH_ATTACHMENTS = '*, com_t_chat_attachment(*)';

/**
 * Supabaseの結合結果 (com_t_chat_attachment) を ChatMessage.attachments に正規化する
 */
function normalizeMessageRow(row: Omit<ChatMessage, 'attachments'> & {
  com_t_chat_attachment?: ChatAttachmentRecord[] | null;
}): ChatMessage {
  const { com_t_chat_attachment, ...rest } = row;
  return { ...rest, attachments: com_t_chat_attachment ?? [] };
}

/**
 * 論理削除済みメッセージの本文・添付ファイルをマスクする（roomActions.ts の同名関数と同じ実装）
 */
function maskIfDeleted(msg: ChatMessage): ChatMessage {
  return msg.deleted_at ? { ...msg, message: '', attachments: [] } : msg;
}

/**
 * メッセージ送信
 * 送信者の参加権限・なりすまし防止はRLS（sender_user_id = auth.uid() かつ is_chat_room_member）で担保される。
 * attachments を渡すと、メッセージ本体の作成に続けて com_t_chat_attachment へ紐付け保存する
 * （複数添付・添付+コメントの同時投稿に対応）。
 */
export async function sendChatMessage(
  payload: SendChatMessagePayload
): Promise<{ success: boolean; data?: ChatMessage; error?: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const message = payload.message.trim();
    const attachments = payload.attachments ?? [];
    if (!message && attachments.length === 0) {
      return { success: false, error: 'Message must not be empty' };
    }

    const messageType = attachments.length === 0
      ? CHAT_MESSAGE_TYPES.TEXT
      : attachments.every((a) => a.file_type.startsWith('image/'))
        ? CHAT_MESSAGE_TYPES.IMAGE
        : CHAT_MESSAGE_TYPES.FILE;

    const { data: chatRow, error } = await supabase
      .from('com_t_chat')
      .insert({
        room_id: payload.roomId,
        sender_user_id: user.id,
        message,
        message_type: messageType,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('chat:send_message_failed', error.message, { ...ctx, payload: { roomId: payload.roomId } });
      return { success: false, error: error.message };
    }

    if (attachments.length > 0) {
      const { data: attachmentRows, error: attachmentError } = await supabase
        .from('com_t_chat_attachment')
        .insert(
          attachments.map((a) => ({
            chat_id: chatRow.chat_id,
            file_path: a.file_path,
            file_name: a.file_name,
            file_type: a.file_type,
            file_size: a.file_size,
          }))
        )
        .select('*');

      if (attachmentError) {
        logger.error('chat:send_message_attachments_failed', attachmentError.message, {
          ...ctx,
          payload: { roomId: payload.roomId, chatId: chatRow.chat_id },
        });
        return { success: true, data: { ...chatRow, attachments: [] } as ChatMessage };
      }

      return { success: true, data: { ...chatRow, attachments: attachmentRows } as ChatMessage };
    }

    return { success: true, data: { ...chatRow, attachments: [] } as ChatMessage };
  } catch (err) {
    logger.error('chat:send_message_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: { roomId: payload.roomId },
    });
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * 指定ルームのメッセージをカーソルベースで取得（created_at 降順）
 * @param cursor 直前に取得した最古メッセージの created_at。指定するとそれより古いメッセージを返す。
 */
export async function getChatMessages(params: {
  roomId: string;
  limit?: number;
  cursor?: string;
}): Promise<{ success: boolean; data: ChatMessage[]; hasMore: boolean; error?: string }> {
  const ctx = await getLogContext();
  const limit = params.limit ?? 30;

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, data: [], hasMore: false, error: 'Unauthorized' };

    // 論理削除済みメッセージも「削除されたことが分かる」形で表示するため除外しない（本文はマスクして返す）
    let query = supabase
      .from('com_t_chat')
      .select(MESSAGE_SELECT_WITH_ATTACHMENTS)
      .eq('room_id', params.roomId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (params.cursor) {
      query = query.lt('created_at', params.cursor);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('chat:get_messages_failed', error.message, { ...ctx, payload: { roomId: params.roomId } });
      return { success: false, data: [], hasMore: false, error: error.message };
    }

    const rows = data || [];
    const hasMore = rows.length > limit;

    return { success: true, data: rows.slice(0, limit).map((m) => maskIfDeleted(normalizeMessageRow(m))), hasMore };
  } catch (err) {
    logger.error('chat:get_messages_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: { roomId: params.roomId },
    });
    return { success: false, data: [], hasMore: false, error: 'Unexpected error' };
  }
}

/**
 * 単一メッセージを添付ファイル込みで取得する。
 * Realtime購読のINSERTイベントは com_t_chat のカラムしか運ばないため、
 * 添付ファイルを含む完全な形で画面に反映するためのハイドレーション用に使う。
 */
export async function getChatMessageById(chatId: string): Promise<{
  success: boolean;
  data?: ChatMessage;
  error?: string;
}> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('com_t_chat')
      .select(MESSAGE_SELECT_WITH_ATTACHMENTS)
      .eq('chat_id', chatId)
      .single();

    if (error || !data) {
      logger.error('chat:get_message_by_id_failed', error?.message || 'Not found', { ...ctx, payload: { chatId } });
      return { success: false, error: error?.message || 'Not found' };
    }

    return { success: true, data: maskIfDeleted(normalizeMessageRow(data)) };
  } catch (err) {
    logger.error('chat:get_message_by_id_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: { chatId },
    });
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * 既読位置の更新（com_t_chat_room_user.last_read_chat_id）
 */
export async function markAsRead(params: {
  roomId: string;
  chatId: string;
}): Promise<{ success: boolean; error?: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { error } = await supabase
      .from('com_t_chat_room_user')
      .update({ last_read_chat_id: params.chatId })
      .eq('room_id', params.roomId)
      .eq('user_id', user.id);

    if (error) {
      logger.error('chat:mark_read_failed', error.message, { ...ctx, payload: params });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    logger.error('chat:mark_read_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: params,
    });
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * メッセージの論理削除（Adminのみ、ポリシー違反等のモデレーション用途）
 * 削除後、本文はマスクされ「削除されたメッセージです」として表示される。
 */
export async function deleteChatMessage(params: {
  chatId: string;
}): Promise<{ success: boolean; error?: string }> {
  const ctx = await getLogContext();
  try {
    const currentUser = await getCurrentUserWithType();
    if (!currentUser) return { success: false, error: 'Unauthorized' };

    if (currentUser.user_type !== USER_TYPES.ADMIN) {
      logger.warn('chat:delete_message_forbidden', 'Non-admin user attempted to delete a chat message', {
        ...ctx,
        payload: params,
      });
      return { success: false, error: 'Only admins can delete messages' };
    }

    const supabase = await createServerClient();
    const { error } = await supabase
      .from('com_t_chat')
      .update({ deleted_at: new Date().toISOString() })
      .eq('chat_id', params.chatId);

    if (error) {
      logger.error('chat:delete_message_failed', error.message, { ...ctx, payload: params });
      return { success: false, error: error.message };
    }

    logger.info('chat:delete_message_success', `Chat message deleted: ${params.chatId}`, { ...ctx, payload: params });
    return { success: true };
  } catch (err) {
    logger.error('chat:delete_message_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: params,
    });
    return { success: false, error: 'Unexpected error' };
  }
}
