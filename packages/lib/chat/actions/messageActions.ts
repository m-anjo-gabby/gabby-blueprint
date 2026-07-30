'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { USER_TYPES } from '@gabby/types/user';
import { CHAT_MESSAGE_TYPES, ChatMessage, SendChatMessagePayload } from '@gabby/types/chat';
import { getCurrentUserWithType } from './roomActions';

const logger = createLogger('common');

/**
 * 論理削除済みメッセージの本文をマスクする（roomActions.ts の同名関数と同じ実装）
 */
function maskIfDeleted(msg: ChatMessage): ChatMessage {
  return msg.deleted_at ? { ...msg, message: '' } : msg;
}

/**
 * メッセージ送信
 * 送信者の参加権限・なりすまし防止はRLS（sender_user_id = auth.uid() かつ is_chat_room_member）で担保される。
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
    if (!message) return { success: false, error: 'Message must not be empty' };

    const { data, error } = await supabase
      .from('com_t_chat')
      .insert({
        room_id: payload.roomId,
        sender_user_id: user.id,
        message,
        message_type: payload.messageType || CHAT_MESSAGE_TYPES.TEXT,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('chat:send_message_failed', error.message, { ...ctx, payload: { roomId: payload.roomId } });
      return { success: false, error: error.message };
    }

    return { success: true, data: data as ChatMessage };
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
      .select('*')
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

    return { success: true, data: rows.slice(0, limit).map((m) => maskIfDeleted(m as ChatMessage)), hasMore };
  } catch (err) {
    logger.error('chat:get_messages_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: { roomId: params.roomId },
    });
    return { success: false, data: [], hasMore: false, error: 'Unexpected error' };
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
