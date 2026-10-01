'use client';

import { useEffect } from 'react';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import type { ShellNavContext, ShellNavId } from '@/constants/navigation';

export interface ShellNavBadge {
  /** 件数バッジ（未読数など） */
  count?: number;
  /** 件数を伴わない「新着・未確認」ドット（現在は使用箇所なし） */
  dot?: boolean;
}

export type ShellNavBadges = Partial<Record<ShellNavId, ShellNavBadge>>;

/**
 * ナビ項目に付けるバッジを算出する。
 * - チャット: 未読メッセージ件数
 */
export function useShellNavBadges(ctx: ShellNavContext): ShellNavBadges {
  const chatUnread = useChatStore((state) => state.totalUnreadCount);
  const fetchRooms = useChatStore((state) => state.fetchRooms);

  // シェルはタブ遷移をまたいで維持されるため、未読数の初期取得はマウント時の1回のみ。
  // 以降はチャット画面側の既読化・受信反映（useChatStore）でバッジが更新される。
  useEffect(() => {
    if (ctx.hasLiveSession) fetchRooms();
  }, [ctx.hasLiveSession, fetchRooms]);

  return {
    chat: chatUnread > 0 ? { count: chatUnread } : undefined,
  };
}
