'use client';

import { useChatStore } from '../stores/useChatStore';
import { useNoticeStore } from '../stores/useNoticeStore';
import { useNotificationStore } from '../stores/useNotificationStore';
import type { CommonShellData, CommonShellDataOptions } from './shellDataTypes';

/*
 * サーバーで取得したシェルの初期データ（loadCommonShellData）を、共通のストアに流し込む処理。
 * 各アプリのシェルのデータローダー（useLayoutEffect）から使う。アプリ固有のストア（coach のマッチング依頼等）は
 * 各アプリ側で同じ手順を足す。
 */

/**
 * 共通のストアの「取得中」を切り替える。
 * ヘッダー・ナビ・画面の各部品は表示時（useEffect）にストアの fetch を呼ぶため、それより先に（useLayoutEffect で）
 * 取得中にしておき、同じ取得をブラウザから重ねて呼ばせない（各ストアの fetch は取得中は何もしない）。
 */
export function setCommonShellStoresLoading(isLoading: boolean, { includeChat }: CommonShellDataOptions) {
  if (includeChat) useChatStore.setState({ isLoading });
  useNoticeStore.setState({ isLoading });
  useNotificationStore.setState({ isLoading });
}

/** 取得できた項目は反映し、取得できなかった項目だけブラウザから取り直す（先に取得中を解除してから呼ぶ） */
export function applyCommonShellData(d: CommonShellData | null, { includeChat }: CommonShellDataOptions) {
  if (includeChat) {
    if (d?.rooms) useChatStore.getState().applyRooms(d.rooms);
    else void useChatStore.getState().fetchRooms(true);
  }
  if (d?.notices) useNoticeStore.getState().applyNotices(d.notices);
  else void useNoticeStore.getState().fetchNotices(true);
  if (d?.notifications) useNotificationStore.getState().applyNotifications(d.notifications);
  else void useNotificationStore.getState().fetchNotifications(true);
}
