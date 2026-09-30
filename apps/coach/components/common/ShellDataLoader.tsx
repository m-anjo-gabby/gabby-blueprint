'use client';

import { useLayoutEffect } from 'react';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { useNotificationStore } from '@gabby/lib/stores/useNotificationStore';
import { useRequestsStore } from '@/stores/useRequestsStore';
import type { CoachShellData } from '@/lib/shellData';

/** シェルの件数を持つ各ストアの「取得中」を切り替える */
function setShellStoresLoading(isLoading: boolean) {
  useChatStore.setState({ isLoading });
  useNoticeStore.setState({ isLoading });
  useNotificationStore.setState({ isLoading });
  useRequestsStore.setState({ isLoading });
}

/** サーバーで取得できた項目は反映し、取得できなかった項目だけブラウザから取り直す */
function applyShellData(d: CoachShellData | null) {
  if (d?.rooms) useChatStore.getState().applyRooms(d.rooms);
  else void useChatStore.getState().fetchRooms(true);
  if (d?.notices) useNoticeStore.getState().applyNotices(d.notices);
  else void useNoticeStore.getState().fetchNotices(true);
  if (d?.notifications) useNotificationStore.getState().applyNotifications(d.notifications);
  else void useNotificationStore.getState().fetchNotifications(true);
  if (d?.requests) useRequestsStore.getState().applyRequests(d.requests);
  else void useRequestsStore.getState().fetchRequests(true);
}

/**
 * サーバーで取得したシェルの初期データ（未読・件数）を各ストアに流し込む。
 * レイアウトから Promise のまま受け取るため、画面の表示は待たせず、データは HTML/RSC の続きとして届く。
 *
 * ヘッダー・サイドバー・画面の各部品は表示時（useEffect）に各ストアの fetch を呼ぶが、ここでは
 * それより先に実行される useLayoutEffect で各ストアを「取得中」にしておき、同じ取得をブラウザから
 * 重ねて呼ばせない（各ストアの fetch は取得中は何もしない）。
 */
export function ShellDataLoader({ data }: { data: Promise<CoachShellData> }) {
  useLayoutEffect(() => {
    let active = true;
    setShellStoresLoading(true);

    const settle = (d: CoachShellData | null) => {
      if (!active) return;
      active = false;
      // 取得中を解除してから反映する（取り直す項目の fetch が取得中の判定で止まらないように）
      setShellStoresLoading(false);
      applyShellData(d);
    };
    data.then(settle, () => settle(null));

    return () => {
      // 反映前に外れた場合も「取得中」のまま残さない（再実行時はもう一度取得中にしてから待つ）
      if (active) setShellStoresLoading(false);
      active = false;
    };
  }, [data]);

  return null;
}
