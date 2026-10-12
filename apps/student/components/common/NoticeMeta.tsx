'use client';

import { Info, Megaphone, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatZonedDateJapanese } from '@gabby/lib/date/date';
import { NOTICE_TYPES, NOTICE_IMPORTANT_BADGE, type NoticeItem, type NoticeType } from '@gabby/types/notice';

const NOTICE_TYPE_ICONS: Record<NoticeType, LucideIcon> = {
  INFO: Info,
  CAMPAIGN: Megaphone,
  MAINTENANCE: Wrench,
  UPDATE: Sparkles,
};

interface NoticeMetaProps {
  notice: Pick<NoticeItem, 'notice_type' | 'published_at' | 'is_important'>;
  size?: 'md' | 'sm';
  className?: string;
}

/**
 * お知らせの種別アイコン・「種別・公開日」・重要の印（ポップアップとホームのカードで共通）。
 * 種別は色分けせず、アイコンとブランド色の下地で示す。
 */
export function NoticeMeta({ notice, size = 'md', className }: NoticeMetaProps) {
  const timezone = useTimezone();
  const TypeIcon = NOTICE_TYPE_ICONS[notice.notice_type] ?? Info;
  const typeLabel = NOTICE_TYPES[notice.notice_type]?.label ?? notice.notice_type;

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-3', className)}>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand',
          size === 'md' ? 'size-10' : 'size-8'
        )}
      >
        <TypeIcon size={size === 'md' ? 20 : 16} aria-hidden />
      </span>
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-ink-muted">
        <span>
          {typeLabel}・{formatZonedDateJapanese(notice.published_at, timezone)}
        </span>
        {notice.is_important && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
            {NOTICE_IMPORTANT_BADGE.label}
          </span>
        )}
      </p>
    </div>
  );
}
