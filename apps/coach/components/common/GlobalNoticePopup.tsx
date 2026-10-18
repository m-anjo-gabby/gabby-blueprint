'use client';

import { usePathname } from 'next/navigation';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { NoticePopupDialog } from '@/components/common/NoticePopupDialog';

/**
 * App-wide notice popup wrapper.
 * 1. Shown when the coach clicks a specific notice (selectedNotice)
 * 2. Auto-shown on dashboard access: only the first unread popup notice (important first, then newest),
 *    with a link to the notice list for the rest. Once closed, not shown again in the same session.
 */
export function GlobalNoticePopup() {
  const pathname = usePathname();
  const dialogNotices = useNoticeStore((s) => s.dialogNotices);
  const isDialogDismissed = useNoticeStore((s) => s.isDialogDismissed);
  const dismissDialog = useNoticeStore((s) => s.dismissDialog);
  const selectedNoticeId = useNoticeStore((s) => s.selectedNoticeId);
  const setSelectedNoticeId = useNoticeStore((s) => s.setSelectedNoticeId);
  const notices = useNoticeStore((s) => s.notices);

  // 1. Manually opened notice
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

  // 2. Auto popup on dashboard access
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
