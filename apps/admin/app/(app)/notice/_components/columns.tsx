'use client';

import Link from 'next/link';
import type { ListColumnDef } from '@/components/list/listTable';
import type { useTranslations } from 'next-intl';
import { Building2, CheckCheck, CheckCircle2, Clock, Edit3, EyeOff, Globe, Paperclip, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatToJstDateTime } from '@gabby/lib/date/date';
import { NOTICE_IMPORTANT_BADGE, NOTICE_TYPES, type AdminNoticeListItem } from '@gabby/types/notice';

type TableT = ReturnType<typeof useTranslations<'notice.table'>>;

const STATUS_BADGE_CLASS = 'inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border';
const TAG_BADGE_CLASS = 'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border';
const ACTION_CLASS = 'p-2 rounded-xl text-slate-400 transition-all active:scale-95';

/** 公開ステータス（下書き / 予約公開 / 終了 / 公開中）。現在時刻と公開・終了日時から判定する */
function PublishStatusBadge({ notice, t }: { notice: AdminNoticeListItem; t: TableT }) {
  if (!notice.is_published) {
    return (
      <span className={cn(STATUS_BADGE_CLASS, 'bg-slate-100 text-slate-600 border-slate-200')}>
        <EyeOff size={10} /> {t('statusDraft')}
      </span>
    );
  }
  const now = new Date();
  if (new Date(notice.published_at) > now) {
    return (
      <span className={cn(STATUS_BADGE_CLASS, 'bg-amber-50 text-amber-700 border-amber-200')}>
        <Clock size={10} /> {t('statusScheduled')}
      </span>
    );
  }
  if (notice.expired_at && new Date(notice.expired_at) < now) {
    return <span className={cn(STATUS_BADGE_CLASS, 'bg-slate-100 text-slate-500 border-slate-200')}>{t('statusEnded')}</span>;
  }
  return (
    <span className={cn(STATUS_BADGE_CLASS, 'bg-emerald-50 text-emerald-700 border-emerald-200')}>
      <CheckCircle2 size={10} /> {t('statusPublished')}
    </span>
  );
}

export function createColumns(
  t: TableT,
  { onDelete }: { onDelete: (notice: AdminNoticeListItem) => void }
): ListColumnDef<AdminNoticeListItem>[] {
  return [
    {
      accessorKey: 'title',
      header: t('titleHeader'),
      cell: ({ row }) => {
        const notice = row.original;
        return (
          <div className="flex min-w-60 flex-col gap-1">
            <Link
              href={`/notice/${notice.notice_id}/edit`}
              className="line-clamp-1 font-black leading-snug text-slate-800 transition-colors hover:text-brand"
            >
              {notice.title}
            </Link>
            <div className="flex flex-wrap items-center gap-1.5">
              {notice.is_important && (
                <span className={cn(TAG_BADGE_CLASS, NOTICE_IMPORTANT_BADGE.badgeClass)}>{NOTICE_IMPORTANT_BADGE.label}</span>
              )}
              {notice.display_mode === 'POPUP' && (
                <span className={cn(TAG_BADGE_CLASS, 'bg-purple-50 text-purple-700 border-purple-200')}>{t('popupBadge')}</span>
              )}
              {notice.display_mode === 'HOME' && (
                <span className={cn(TAG_BADGE_CLASS, 'bg-sky-50 text-sky-700 border-sky-200')}>{t('homeBadge')}</span>
              )}
              {notice.cta_url && (
                <span className={cn(TAG_BADGE_CLASS, 'bg-slate-50 text-slate-600 border-slate-200')}>{t('ctaBadge')}</span>
              )}
              {notice.attachments?.length > 0 && (
                <span className="flex items-center gap-0.5 text-[9px] font-black text-slate-400">
                  <Paperclip size={10} />
                  {notice.attachments.length}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'notice_type',
      header: t('typeHeader'),
      cell: ({ row }) => {
        const type = NOTICE_TYPES[row.original.notice_type];
        return (
          <span
            className={cn(
              'inline-block rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider',
              (type ?? NOTICE_TYPES.INFO).badgeClass
            )}
          >
            {type?.label ?? row.original.notice_type}
          </span>
        );
      },
    },
    {
      accessorKey: 'target_type',
      header: t('targetHeader'),
      cell: ({ row }) => {
        const notice = row.original;
        if (notice.target_type === 'ALL') {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600">
              <Globe size={13} className="text-slate-400" /> {t('targetAll')}
            </span>
          );
        }
        if (notice.target_type === 'COACH') {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
              <Users size={13} className="text-emerald-500" /> {t('targetCoach')}
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand">
            <Building2 size={13} className="text-brand-500" />
            {notice.client_name || t('targetClientFallback')}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: t('statusHeader'),
      cell: ({ row }) => <PublishStatusBadge notice={row.original} t={t} />,
    },
    {
      accessorKey: 'published_at',
      header: t('publishedAtHeader'),
      cell: ({ row }) => <span className="font-mono text-[11px] text-slate-600">{formatToJstDateTime(row.original.published_at)}</span>,
    },
    {
      accessorKey: 'expired_at',
      header: t('expiredAtHeader'),
      cell: ({ row }) => (
        <span className="font-mono text-[11px] text-slate-600">
          {row.original.expired_at ? (
            formatToJstDateTime(row.original.expired_at)
          ) : (
            <span className="text-slate-400">{t('noExpiry')}</span>
          )}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{t('actionsHeader')}</div>,
      cell: ({ row }) => {
        const notice = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Link
              href={`/notice/${notice.notice_id}/edit`}
              className={cn(ACTION_CLASS, 'hover:bg-brand-50 hover:text-brand')}
              title={t('editTooltip')}
            >
              <Edit3 size={15} />
            </Link>
            <Link
              href={`/notice/${notice.notice_id}/reads`}
              className={cn(ACTION_CLASS, 'hover:bg-emerald-50 hover:text-emerald-600')}
              title={t('readsTooltip')}
            >
              <CheckCheck size={15} />
            </Link>
            <button
              type="button"
              onClick={() => onDelete(notice)}
              className={cn(ACTION_CLASS, 'hover:bg-rose-50 hover:text-rose-600')}
              title={t('deleteTooltip')}
            >
              <Trash2 size={15} />
            </button>
          </div>
        );
      },
    },
  ];
}
