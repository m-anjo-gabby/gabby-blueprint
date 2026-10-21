'use client';

import { NoticePopup } from '@gabby/lib/components/notice/NoticePopup';
import { NOTICE_LABELS_JA } from '@gabby/lib/notice/labels';
import type { NoticeItem } from '@gabby/types/notice';

interface NoticePopupDialogProps {
  notice: NoticeItem;
  /** ほかに未読のポップアップ対象が何件あるか。1件以上なら一覧への案内を出す */
  moreCount?: number;
  onClose: () => void;
}

/** お知らせのポップアップ（共通の NoticePopup に生徒アプリの文言を渡す） */
export function NoticePopupDialog(props: NoticePopupDialogProps) {
  return <NoticePopup labels={NOTICE_LABELS_JA} {...props} />;
}
