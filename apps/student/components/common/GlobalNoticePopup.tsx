'use client';

import { usePathname } from 'next/navigation';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { NoticePopupDialog } from '@/components/common/NoticePopupDialog';

/**
 * アプリケーション全体で使い回せるお知らせポップアップのラッパーコンポーネント
 * 1. ユーザーが特定のお知らせをクリックして開いた場合 (selectedNotice)
 * 2. ダッシュボードアクセス時に自動表示される場合 (dialogNotices)
 */
export function GlobalNoticePopup() {
  const {
    dialogNotices,
    isDialogDismissed,
    dismissDialog,
    selectedNoticeId,
    setSelectedNoticeId,
    notices,
  } = useNoticeStore();
  const pathname = usePathname();

  // 1. 手動で開かれたダイアログの表示判定
  const selectedNotice = selectedNoticeId
    ? notices.find((n) => n.notice_id === selectedNoticeId)
    : null;

  if (selectedNotice) {
    return (
      <NoticePopupDialog
        notices={[selectedNotice]}
        onClose={() => setSelectedNoticeId(null)}
      />
    );
  }

  // 2. ダッシュボードの自動ポップアップの表示判定
  const isDashboard = pathname === '/dashboard';
  const showAutoPopup = isDashboard && dialogNotices.length > 0 && !isDialogDismissed;

  if (showAutoPopup) {
    return (
      <NoticePopupDialog
        notices={dialogNotices}
        onClose={dismissDialog}
      />
    );
  }

  return null;
}
