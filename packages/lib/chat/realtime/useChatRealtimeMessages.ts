'use client';

import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@gabby/lib/supabase/client';
import { ChatMessage } from '@gabby/types/chat';
import { getChatMessageById } from '@gabby/lib/chat/actions/messageActions';

/**
 * 指定ルームの新着メッセージ（INSERT）をRealtime購読する。
 * 全件購読を避けるため、必ず room_id によるfilterを付与する。
 * postgres_changes の payload には com_t_chat のカラムしか含まれず添付ファイル
 * (com_t_chat_attachment) が乗らないため、受信時に添付ファイル込みで取得し直す。
 */
export function useChatRealtimeMessages(roomId: string | null, onInsert: (message: ChatMessage) => void) {
  const onInsertRef = useRef(onInsert);
  useEffect(() => {
    onInsertRef.current = onInsert;
  }, [onInsert]);

  useEffect(() => {
    if (!roomId) return;

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`chat_room_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'com_t_chat',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const chatId = (payload.new as ChatMessage).chat_id;
          getChatMessageById(chatId).then((res) => {
            if (res.success && res.data) {
              onInsertRef.current(res.data);
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);
}
