'use client';

import type { ReactNode } from 'react';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { NoticePopupDialog } from '@/components/common/NoticePopupDialog';

/**
 * 自動表示ポップアップ（閉じられるもの）の登録簿
 *
 * - 規約同意のような操作をブロックする「ゲート」はここに含めない（layout.tsx でサーバー判定）
 * - 新しいポップアップ（ストリーク等）を追加するときは、PopupId に id を足し、
 *   useAutoPopups 内で表示条件を満たす場合に popups へ push する
 * - 表示の排他・順番・画面の絞り込みは PopupHost が担うため、各ポップアップ側では考慮しない
 */

/** 自動表示してよい画面。没入画面（ドリル・通話等）には出さない */
export const POPUP_SCOPES = {
  dashboard: (pathname: string) => pathname === '/dashboard',
} as const satisfies Record<string, (pathname: string) => boolean>;

export type PopupScope = keyof typeof POPUP_SCOPES;

export type PopupId = 'notice';

export interface AutoPopup {
  id: PopupId;
  /** 小さいほど優先して表示する */
  priority: number;
  scope: PopupScope;
  render: (onDone: () => void) => ReactNode;
}

interface AutoPopupCandidates {
  /**
   * 判定材料がすべて揃ったか。
   * 揃う前に表示を始めると、後から優先度の高いものに差し替わってしまうため待つ。
   */
  ready: boolean;
  /** 表示条件を満たすポップアップ（優先度順） */
  popups: AutoPopup[];
}

export function useAutoPopups(): AutoPopupCandidates {
  const dialogNotices = useNoticeStore((s) => s.dialogNotices);
  const noticesReady = useNoticeStore((s) => s.lastFetched !== null);

  const popups: AutoPopup[] = [];

  // お知らせ: show_dialog=TRUE かつ未読
  if (dialogNotices.length > 0) {
    popups.push({
      id: 'notice',
      priority: 10,
      scope: 'dashboard',
      render: (onDone) => <NoticePopupDialog notices={dialogNotices} onClose={onDone} />,
    });
  }

  return {
    ready: noticesReady,
    popups: popups.sort((a, b) => a.priority - b.priority),
  };
}
