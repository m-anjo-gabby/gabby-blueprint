'use client';

import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { getNoticeImageUrl, isExternalNoticeCtaUrl } from '@gabby/lib/notice/links';
import { clientLogger } from '@gabby/lib/logger/client';
import type { NoticeItem } from '@gabby/types/notice';

type NoticeCtaSource = Pick<NoticeItem, 'notice_id' | 'cta_label' | 'cta_url'>;

/** 行動ボタンを出すか（文言とリンク先が両方そろっている場合だけ） */
export function hasNoticeCta(notice: NoticeCtaSource): notice is NoticeCtaSource & { cta_label: string; cta_url: string } {
  return Boolean(notice.cta_label && notice.cta_url);
}

interface NoticeCtaLinkProps {
  notice: NoticeCtaSource;
  /** 押した直後に呼ぶ（ポップアップを閉じる等） */
  onClick?: () => void;
  className?: string;
}

/**
 * お知らせの行動ボタン。アプリ内の画面はそのまま遷移し、外部ページは別タブで開く。
 * 押したことを記録する（既読も兼ねる）。ポップアップ・ホームのカード・お知らせ一覧で共通。
 */
export function NoticeCtaLink({ notice, onClick, className }: NoticeCtaLinkProps) {
  const recordCtaClick = useNoticeStore((s) => s.recordCtaClick);
  if (!hasNoticeCta(notice)) return null;

  const isExternal = isExternalNoticeCtaUrl(notice.cta_url);
  const handleClick = () => {
    onClick?.();
    recordCtaClick(notice.notice_id).catch((err: unknown) => {
      clientLogger.error('notice:cta_click_failed', 'Failed to record notice CTA click', { err });
    });
  };
  const classes = cn(
    'inline-flex items-center justify-center gap-1.5 rounded-control bg-brand px-5 text-sm font-bold text-white transition-colors hover:bg-brand-strong',
    className
  );
  const Icon = isExternal ? ExternalLink : ChevronRight;

  if (isExternal) {
    return (
      <a href={notice.cta_url} target="_blank" rel="noopener noreferrer" onClick={handleClick} className={classes}>
        {notice.cta_label}
        <Icon size={16} aria-hidden />
        <span className="sr-only">（別のタブで開きます）</span>
      </a>
    );
  }
  return (
    <Link href={notice.cta_url} onClick={handleClick} className={classes}>
      {notice.cta_label}
      <Icon size={16} aria-hidden />
    </Link>
  );
}

/** お知らせの見出し画像（16:9）。画像が無い場合は何も出さない */
export function NoticeImage({ imagePath, className }: { imagePath: string | null; className?: string }) {
  const src = getNoticeImageUrl(imagePath);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Storage の公開URL（サイズはお知らせごとに異なる）
    <img src={src} alt="" className={cn('aspect-video w-full rounded-card bg-canvas object-cover', className)} />
  );
}
