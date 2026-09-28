'use client';

import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@gabby/lib/supabase/client';

/**
 * 1対1ルームの相手の既読位置（com_t_chat_room_user.last_read_chat_id）の更新をRealtime購読する。
 * 相手がルームを開いて既読にした時点で、こちらの「既読」表示を進めるために使う。
 * 購読は room_id で絞り、RLS（同じルームの参加者のみ閲覧可）の範囲の行だけが届く。
 */
export function useChatReadReceipt(
  roomId: string,
  counterpartUserId: string | null,
  onRead: (lastReadChatId: string) => void
) {
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  useEffect(() => {
    if (!counterpartUserId) return;

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`chat_read_${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'com_t_chat_room_user', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_chat_id: string | null };
          if (row.user_id === counterpartUserId && row.last_read_chat_id) {
            onReadRef.current(row.last_read_chat_id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, counterpartUserId]);
}
