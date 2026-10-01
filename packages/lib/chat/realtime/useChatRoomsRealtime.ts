'use client';

import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@gabby/lib/supabase/client';
import { getChatMessageById } from '@gabby/lib/chat/actions/messageActions';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { ChatMessage } from '@gabby/types/chat';

interface UseChatRoomsRealtimeOptions {
  /**
   * 一覧に無いルームの新着を受けたとき一覧を再取得するか（新規ルームの反映用）。
   * Adminは全ルームのメッセージを閲覧できるRLSのため、非参加ルームの新着のたびに
   * 再取得しないよう false にする。
   */
  refetchOnUnknownRoom?: boolean;
}

/**
 * ルーム一覧（2ペインの左側）を最新に保つためのRealtime購読。
 * com_t_chat のINSERTを購読し、ルーム一覧の最新メッセージ・未読数・並び順を更新する。
 * 受信できるのはRLSで閲覧可能なメッセージ（参加中のルーム、Adminは全ルーム）のみ。
 */
export function useChatRoomsRealtime(currentUserId: string | undefined, options: UseChatRoomsRealtimeOptions = {}) {
  const { refetchOnUnknownRoom = true } = options;
  const refetchRef = useRef(refetchOnUnknownRoom);
  useEffect(() => {
    refetchRef.current = refetchOnUnknownRoom;
  }, [refetchOnUnknownRoom]);

  useEffect(() => {
    if (!currentUserId) return;

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`chat_rooms_${currentUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'com_t_chat' }, (payload) => {
        const inserted = payload.new as ChatMessage;
        const store = useChatStore.getState();
        const isKnownRoom = store.rooms.some((r) => r.room_id === inserted.room_id);
        if (!isKnownRoom) {
          if (refetchRef.current) store.fetchRooms(true);
          return;
        }
        // payload には添付ファイル（別テーブル）が乗らず、プレビューの「写真/ファイル」判定に必要なため取得し直す
        getChatMessageById(inserted.chat_id).then((res) => {
          if (res.success && res.data) {
            useChatStore.getState().applyIncomingMessage(res.data, currentUserId);
          }
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);
}
