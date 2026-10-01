'use client';

import { Fragment, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { NoticePopupDialog } from '@/components/common/NoticePopupDialog';
import { POPUP_SCOPES, useAutoPopups, type PopupId } from './useAutoPopups';

interface PopupHostProps {
  /** 規約同意などのゲートが未解決か。未解決の間はポップアップを一切表示しない */
  hasPendingGate: boolean;
}

/**
 * 生徒アプリのポップアップ表示を一元管理するホスト
 *
 * 表示の優先順位:
 * 1. ゲート（規約同意）… layout.tsx 側で表示。未解決の間はここでは何も出さない
 * 2. 利用者が自分で開いたお知らせ（通知一覧からのクリック）
 * 3. 自動表示ポップアップ … 優先度の最も高い1件のみ。1回の画面訪問につき1件まで
 */
export function PopupHost({ hasPendingGate }: PopupHostProps) {
  const pathname = usePathname();
  const { ready, popups } = useAutoPopups();
  const notices = useNoticeStore((s) => s.notices);
  const selectedNoticeId = useNoticeStore((s) => s.selectedNoticeId);
  const setSelectedNoticeId = useNoticeStore((s) => s.setSelectedNoticeId);

  // セッション中に閉じた自動ポップアップ（同じセッションでは再表示しない）
  const [dismissed, setDismissed] = useState<ReadonlySet<PopupId>>(() => new Set());
  // 画面訪問ごとに自動表示は1件まで（連続表示によるポップアップ疲れを防ぐ）
  const [visitPath, setVisitPath] = useState(pathname);
  const [hasShownThisVisit, setHasShownThisVisit] = useState(false);
  if (visitPath !== pathname) {
    setVisitPath(pathname);
    setHasShownThisVisit(false);
  }

  if (hasPendingGate) return null;

  const selectedNotice = selectedNoticeId
    ? notices.find((n) => n.notice_id === selectedNoticeId)
    : undefined;
  if (selectedNotice) {
    return (
      <NoticePopupDialog
        key={selectedNotice.notice_id}
        notices={[selectedNotice]}
        onClose={() => setSelectedNoticeId(null)}
      />
    );
  }

  if (!ready || hasShownThisVisit) return null;

  const next = popups.find((p) => !dismissed.has(p.id) && POPUP_SCOPES[p.scope](pathname));
  if (!next) return null;

  const handleDone = () => {
    setDismissed((prev) => new Set(prev).add(next.id));
    setHasShownThisVisit(true);
  };

  return <Fragment key={next.id}>{next.render(handleDone)}</Fragment>;
}
