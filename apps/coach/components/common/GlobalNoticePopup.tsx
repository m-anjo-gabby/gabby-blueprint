'use client';

import { usePathname } from 'next/navigation';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { NoticePopupDialog } from '@/components/common/NoticePopupDialog';

/**
 * App-wide notice popup wrapper.
 * 1. Shown when the coach clicks a specific notice (selectedNotice)
 * 2. Auto-shown on dashboard access for unread show_dialog notices (dialogNotices)
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

  // 1. Manually opened dialog
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

  // 2. Auto popup on dashboard access
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
