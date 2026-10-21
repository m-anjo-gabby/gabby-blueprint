'use client';

import { NoticePopup } from '@gabby/lib/components/notice/NoticePopup';
import { NOTICE_LABELS_EN } from '@gabby/lib/notice/labels';
import type { NoticeItem } from '@gabby/types/notice';

interface NoticePopupDialogProps {
  notice: NoticeItem;
  /** ほかの未読のポップアップのお知らせの件数。1件以上なら、お知らせの一覧へのリンクを出す */
  moreCount?: number;
  onClose: () => void;
}

/** お知らせのポップアップ（共通の NoticePopup にコーチのポータルの英語のラベルを渡したもの） */
export function NoticePopupDialog(props: NoticePopupDialogProps) {
  return <NoticePopup labels={NOTICE_LABELS_EN} {...props} />;
}
