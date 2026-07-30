'use client';

import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@gabby/lib/supabase/client';
import { ChatMessage } from '@gabby/types/chat';

/**
 * 指定ルームの新着メッセージ（INSERT）をRealtime購読する。
 * 全件購読を避けるため、必ず room_id によるfilterを付与する。
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
          onInsertRef.current(payload.new as ChatMessage);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);
}
