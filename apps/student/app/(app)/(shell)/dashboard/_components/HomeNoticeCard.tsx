'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, X } from 'lucide-react';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { toNoticePlainText } from '@gabby/lib/notice/plainText';
import { clientLogger } from '@gabby/lib/logger/client';
import type { NoticeItem } from '@gabby/types/notice';
import { NoticeMeta } from '@/components/common/NoticeMeta';
import { NoticeCtaLink, NoticeImage } from '@/components/common/NoticeCta';

interface HomeNoticeCardProps {
  /** 表示方法が「ホームのカード」の未読のお知らせのうち先頭の1件（重要→新しい順） */
  notice: NoticeItem;
  /** ほかに「ホームのカード」の未読が何件あるか */
  moreCount: number;
}

/**
 * ホームの上部に出すお知らせのカード（割り込まずに知らせる。閉じる・詳しく見る・行動ボタンのいずれかで既読にして消す）。
 * 「詳しく見る」はお知らせのポップアップで全文を開く（PopupHost の利用者が開いたお知らせとして表示）。
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
    <section aria-label="お知らせ" className="rounded-card border border-line bg-surface p-4 shadow-xs sm:p-5">
      <div className="flex gap-5">
        {notice.image_path && (
          <NoticeImage imagePath={notice.image_path} className="hidden w-48 shrink-0 self-start rounded-control sm:block" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <NoticeMeta notice={notice} size="sm" />
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="このお知らせを閉じる"
              className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-canvas hover:text-ink-soft"
            >
              <X size={18} />
            </button>
          </div>
          <h2 className="mt-2 text-base font-bold leading-snug text-ink">{notice.title}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-soft">{toNoticePlainText(notice.content)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <NoticeCtaLink notice={notice} className="h-10" />
            <button
              type="button"
              onClick={handleOpenDetail}
              className="flex h-10 items-center gap-0.5 text-sm font-bold text-brand transition-colors hover:text-brand-strong"
            >
              詳しく見る
              <ChevronRight size={16} aria-hidden />
            </button>
            {moreCount > 0 && (
              <Link
                href="/notice"
                className="ml-auto flex h-10 items-center gap-0.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink-soft"
              >
                ほかに{moreCount}件のお知らせ
                <ChevronRight size={14} aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
