'use client';

import { useEffect } from 'react';
import { createBrowserClient } from '@gabby/lib/supabase/client';
import { useNotificationStore } from '@gabby/lib/stores/useNotificationStore';

/**
 * ログインユーザー宛の通知(com_t_notification)のINSERT/UPDATEをRealtime購読し、
 * 新着・既読状態の変化があればストアを再取得させる。
 * postgres_changesはトリガーのUPSERT結果しか運ばないため、チャット新着通知が集約UPSERT
 * された場合も差分反映ではなく単純に再取得する方針とする（一覧件数が少なく許容範囲のため）。
 */
export function useNotificationRealtime(userId: string | null) {
  const invalidate = useNotificationStore((state) => state.invalidate);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);

  useEffect(() => {
    if (!userId) return;

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
        () => {
          invalidate();
          fetchNotifications(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, invalidate, fetchNotifications]);
}
