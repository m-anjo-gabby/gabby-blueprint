'use client';

import { ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import type { MouseEvent } from 'react';
import type { NoticeItem } from '@gabby/types/notice';
import { useHydrated } from '../../hooks/useHydrated';
import type { NoticeLabels } from '../../notice/labels';
import { getNoticeImageUrl } from '../../notice/links';
import { toNoticePlainText } from '../../notice/plainText';
import { NoticeCtaLink, NoticeImage } from './NoticeCta';
import { NoticeMeta } from './NoticeMeta';

interface NoticeHomeCardProps {
  notice: NoticeItem;
  labels: NoticeLabels;
  /** ほかに「ホームのカード」の未読が何件あるか */
  moreCount: number;
  /** 「このお知らせを閉じる」 */
  onDismiss: () => void;
  /** 「詳しく見る」 */
  onOpenDetail: () => void;
  /** 見出し画像のURL（アドミンのプレビューで未保存の画像を出す場合に指定。省略時は image_path から組み立てる） */
  imageUrl?: string | null;
  /** アドミンのプレビュー（リンク・行動ボタンを押しても移動・記録しない） */
  preview?: boolean;
}

/**
 * ホームの上部に出すお知らせのカード（割り込まずに知らせる）。見た目だけを受け持ち、既読の扱いは使う側で行う。
 * 生徒のホームと、アドミンのプレビューで共通。
 */
export function NoticeHomeCard({
  notice,
  labels,
  moreCount,
  onDismiss,
  onOpenDetail,
  imageUrl,
  preview = false,
}: NoticeHomeCardProps) {
  const isHydrated = useHydrated();
  const src = imageUrl !== undefined ? imageUrl : getNoticeImageUrl(notice.image_path);
  const handleMoreClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (preview) event.preventDefault();
  };

  return (
    // 画像の有無・余白は画面幅ではなくカードの幅で決める（アドミンのプレビューのスマホ枠でも実物と同じに見えるように）
    // 押せる状態になったことを data-ready で示す（サーバーで描いたカードはハイドレーション前の押下が効かない。E2E はこれを待つ。KJ-2026-0928-02）
    <section
      aria-label={labels.homeCard.region}
      data-ready={isHydrated ? 'true' : undefined}
      className="@container rounded-card border border-line bg-surface shadow-xs"
    >
      <div className="flex gap-5 p-4 @lg:p-5">
        {src && <NoticeImage src={src} className="hidden w-48 shrink-0 self-start rounded-control @lg:block" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <NoticeMeta notice={notice} labels={labels} size="sm" />
            <button
              type="button"
              onClick={onDismiss}
              aria-label={labels.homeCard.dismiss}
              className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-canvas hover:text-ink-soft"
            >
              <X size={18} />
            </button>
          </div>
          <h2 className="mt-2 text-base font-bold leading-snug text-ink wrap-anywhere">{notice.title}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-soft">{toNoticePlainText(notice.content)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <NoticeCtaLink notice={notice} labels={labels} preview={preview} className="h-10" />
            <button
              type="button"
              onClick={onOpenDetail}
              className="flex h-10 items-center gap-0.5 text-sm font-bold text-brand transition-colors hover:text-brand-strong"
            >
              {labels.homeCard.detail}
              <ChevronRight size={16} aria-hidden />
            </button>
            {moreCount > 0 && (
              <Link
                href="/notice"
                onClick={handleMoreClick}
                className="ml-auto flex h-10 items-center gap-0.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink-soft"
              >
                {labels.homeCard.moreNotices(moreCount)}
                <ChevronRight size={14} aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
