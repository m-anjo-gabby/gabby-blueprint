'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import type { ShellNavContext, ShellNavId } from '@/constants/navigation';

export interface ShellNavBadge {
  /** 件数バッジ（未読数など） */
  count?: number;
  /** 件数を伴わない「新着・未確認」ドット */
  dot?: boolean;
}

export type ShellNavBadges = Partial<Record<ShellNavId, ShellNavBadge>>;

// ライブセッション紹介（アップセル）画面を一度でも開いたかをブラウザ単位で記録する
const LIVE_INTRO_SEEN_KEY = 'gabby:live-intro-seen';
const LIVE_INTRO_SEEN_EVENT = 'gabby:live-intro-seen';

const readLiveIntroSeen = (): boolean => {
  try {
    return window.localStorage.getItem(LIVE_INTRO_SEEN_KEY) === '1';
  } catch {
    // プライベートブラウズ等でストレージが使えない場合は、ドットを出し続けないよう既読扱いにする
    return true;
  }
};

const subscribeLiveIntroSeen = (onChange: () => void) => {
  window.addEventListener('storage', onChange);
  window.addEventListener(LIVE_INTRO_SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(LIVE_INTRO_SEEN_EVENT, onChange);
  };
};

/**
 * ナビ項目に付けるバッジを算出する。
 * - チャット: 未読メッセージ件数
 * - ライブセッション: 未契約者がまだ紹介画面を開いていない場合のみドット（押し付けない控えめな訴求）
 */
export function useShellNavBadges(ctx: ShellNavContext, pathname: string): ShellNavBadges {
  const chatUnread = useChatStore((state) => state.totalUnreadCount);
  const fetchRooms = useChatStore((state) => state.fetchRooms);
  const liveIntroSeen = useSyncExternalStore(subscribeLiveIntroSeen, readLiveIntroSeen, () => true);

  // シェルはタブ遷移をまたいで維持されるため、未読数の初期取得はマウント時の1回のみ。
  // 以降はチャット画面側の既読化・受信反映（useChatStore）でバッジが更新される。
  useEffect(() => {
    if (ctx.hasLiveSession) fetchRooms();
  }, [ctx.hasLiveSession, fetchRooms]);

  const isOnLiveRoom = pathname === '/live-room';
  useEffect(() => {
    if (ctx.hasLiveSession || !isOnLiveRoom || liveIntroSeen) return;
    try {
      window.localStorage.setItem(LIVE_INTRO_SEEN_KEY, '1');
      window.dispatchEvent(new Event(LIVE_INTRO_SEEN_EVENT));
    } catch {
      // 保存できなくても表示上の支障はないため無視する
    }
  }, [ctx.hasLiveSession, isOnLiveRoom, liveIntroSeen]);

  return {
    chat: chatUnread > 0 ? { count: chatUnread } : undefined,
    live: !ctx.hasLiveSession && !liveIntroSeen ? { dot: true } : undefined,
  };
}
