'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { CHAT_MESSAGE_TYPES, ChatMessage, SendChatMessagePayload } from '@gabby/types/chat';

const logger = createLogger('common');

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

    let query = supabase
      .from('com_t_chat')
      .select('*')
      .eq('room_id', params.roomId)
      .is('deleted_at', null)
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

    return { success: true, data: rows.slice(0, limit) as ChatMessage[], hasMore };
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
