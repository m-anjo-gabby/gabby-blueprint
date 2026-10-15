'use client';

import type { NoticeItem } from '@gabby/types/notice';
import { NoticePopup } from '@gabby/lib/components/notice/NoticePopup';
import { NOTICE_LABELS_EN } from '@gabby/lib/notice/labels';

interface NoticePopupDialogProps {
  notice: NoticeItem;
  /** Number of other unread popup notices. When 1 or more, a link to the notice list is shown */
  moreCount?: number;
  onClose: () => void;
}

/** Notice popup (the shared NoticePopup with the Coach portal's English labels) */
export function NoticePopupDialog(props: NoticePopupDialogProps) {
  return <NoticePopup labels={NOTICE_LABELS_EN} {...props} />;
}
