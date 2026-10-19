'use client';

import { usePathname } from 'next/navigation';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { NoticePopupDialog } from '@/components/common/NoticePopupDialog';

/**
 * アプリ全体のお知らせのポップアップの包み。
 * 1. コーチが特定のお知らせを押した時に出す（selectedNotice）
 * 2. ダッシュボードを開いた時に自動で出す: 未読のポップアップのお知らせの最初の1件だけ（重要なもの、次に新しいもの）で、
 * 残りはお知らせの一覧へのリンクで案内する。閉じたら同じセッションの間は再び出さない。
 */
export function GlobalNoticePopup() {
  const pathname = usePathname();
  const dialogNotices = useNoticeStore((s) => s.dialogNotices);
  const isDialogDismissed = useNoticeStore((s) => s.isDialogDismissed);
  const dismissDialog = useNoticeStore((s) => s.dismissDialog);
  const selectedNoticeId = useNoticeStore((s) => s.selectedNoticeId);
  const setSelectedNoticeId = useNoticeStore((s) => s.setSelectedNoticeId);
  const notices = useNoticeStore((s) => s.notices);

  // 1. 手で開いたお知らせ
  const selectedNotice = selectedNoticeId ? notices.find((n) => n.notice_id === selectedNoticeId) : undefined;
  if (selectedNotice) {
    return (
      <NoticePopupDialog
        key={selectedNotice.notice_id}
        notice={selectedNotice}
        onClose={() => setSelectedNoticeId(null)}
      />
    );
  }

  // 2. ダッシュボードを開いた時の自動のポップアップ
  const [firstNotice] = dialogNotices;
  if (pathname === '/dashboard' && firstNotice && !isDialogDismissed) {
    return (
      <NoticePopupDialog
        key={firstNotice.notice_id}
        notice={firstNotice}
        moreCount={dialogNotices.length - 1}
        onClose={dismissDialog}
      />
    );
  }

  return null;
}
