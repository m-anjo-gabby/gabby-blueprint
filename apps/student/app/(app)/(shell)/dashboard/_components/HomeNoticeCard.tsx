'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { clientLogger } from '@gabby/lib/logger/client';
import { NOTICE_LABELS_JA } from '@gabby/lib/notice/labels';
import { NoticeHomeCard } from '@gabby/lib/components/notice/NoticeHomeCard';
import type { NoticeItem } from '@gabby/types/notice';

interface HomeNoticeCardProps {
  /** 表示方法が「ホームのカード」の未読のお知らせのうち先頭の1件（重要→新しい順） */
  notice: NoticeItem;
  /** ほかに「ホームのカード」の未読が何件あるか */
  moreCount: number;
}

/**
 * ホームの上部に出すお知らせのカード（閉じる・詳しく見る・行動ボタンのいずれかで既読にして消す）。
 * 見た目は共通の NoticeHomeCard。「詳しく見る」はお知らせのポップアップで全文を開く（PopupHost の利用者が開いたお知らせとして表示）。
 */
export function HomeNoticeCard({ notice, moreCount }: HomeNoticeCardProps) {
  const router = useRouter();
  const markAsRead = useNoticeStore((s) => s.markAsRead);
  const setSelectedNoticeId = useNoticeStore((s) => s.setSelectedNoticeId);
  // ポップアップで読んだ・行動ボタンを押した等で既読になったら消す（サーバーの取得結果はそのままのため、ストアの既読を見る）
  const storeNotice = useNoticeStore((s) => s.notices.find((n) => n.notice_id === notice.notice_id));
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || storeNotice?.is_read) return null;

  const handleDismiss = () => {
    setDismissed(true);
    markAsRead(notice.notice_id).catch((err: unknown) => {
      clientLogger.error('notice:mark_read_failed', 'Failed to mark notice as read', { err });
    });
  };

  const handleOpenDetail = () => {
    // 通常はシェルで取得済みのストアにあるためポップアップで開く。無い場合はお知らせ一覧の該当箇所を開く
    if (storeNotice) setSelectedNoticeId(notice.notice_id);
    else router.push(`/notice?focus=${notice.notice_id}`);
  };

  return (
    <NoticeHomeCard
      notice={notice}
      labels={NOTICE_LABELS_JA}
      moreCount={moreCount}
      onDismiss={handleDismiss}
      onOpenDetail={handleOpenDetail}
    />
  );
}
