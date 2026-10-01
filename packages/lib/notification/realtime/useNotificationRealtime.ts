'use client';

import { useEffect } from 'react';
import { createBrowserClient } from '@gabby/lib/supabase/client';
import { useNotificationStore } from '@gabby/lib/stores/useNotificationStore';
import { useChatStore } from '@gabby/lib/stores/useChatStore';

/** 同じルームへの連続送信で一覧の再取得が続かないよう、まとめて1回にする待ち時間 */
const CHAT_REFRESH_DEBOUNCE_MS = 800;

/**
 * ログインユーザー宛の通知(com_t_notification)のINSERT/UPDATEをRealtime購読し、
 * 新着・既読状態の変化があればストアを再取得させる。
 * postgres_changesはトリガーのUPSERT結果しか運ばないため、チャット新着通知が集約UPSERT
 * された場合も差分反映ではなく単純に再取得する方針とする（一覧件数が少なく許容範囲のため）。
 *
 * チャットの新着（CHAT_NEW_MESSAGE が未読になった時）は、チャットのルーム一覧（未読数）も取り直す。
 * ヘッダーの通知ベルは全画面にあるため、チャット画面以外でもナビの未読バッジがリアルタイムに更新される。
 * 新たなRealtime接続・購読は増やさず、この通知の購読（宛先ユーザーで絞り込み済み）に相乗りする。
 */
export function useNotificationRealtime(userId: string | null) {
  const invalidate = useNotificationStore((state) => state.invalidate);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);

  useEffect(() => {
    if (!userId) return;

    let chatRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshChatRooms = () => {
      if (chatRefreshTimer) clearTimeout(chatRefreshTimer);
      chatRefreshTimer = setTimeout(() => {
        chatRefreshTimer = null;
        useChatStore.getState().fetchRooms(true);
      }, CHAT_REFRESH_DEBOUNCE_MS);
    };

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`notification_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'com_t_notification',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          invalidate();
          fetchNotifications(true);

          // 既読化（is_read=true への更新）はチャット側で楽観的に反映済みのため、新着の時だけ取り直す
          const row = payload.new as { notification_type?: string; is_read?: boolean } | undefined;
          if (row?.notification_type === 'CHAT_NEW_MESSAGE' && row.is_read === false) {
            refreshChatRooms();
          }
        }
      )
      .subscribe();

    return () => {
      if (chatRefreshTimer) clearTimeout(chatRefreshTimer);
      supabase.removeChannel(channel);
    };
  }, [userId, invalidate, fetchNotifications]);
}
