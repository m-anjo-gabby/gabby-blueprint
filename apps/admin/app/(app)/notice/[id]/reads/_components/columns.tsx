'use client';

import { Building2, CheckCircle2, CircleDashed } from 'lucide-react';
import type { useTranslations } from 'next-intl';
import { formatToJstDateTime } from '@gabby/lib/date/date';
import { USER_TYPES } from '@gabby/types/user';
import type { NoticeReadStatusUser } from '@/actions/adminNoticeAction';
import { UserTypeLabel } from '@/components/common/UserTypeLabel';
import type { ListColumnDef } from '@/components/list/listTable';
import { cn } from '@/lib/utils';

type TableT = ReturnType<typeof useTranslations<'notice.readsTable'>>;

const BADGE_CLASS =
  'inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border';

export function createColumns(t: TableT, { hasCta }: { hasCta: boolean }): ListColumnDef<NoticeReadStatusUser>[] {
  const columns: ListColumnDef<NoticeReadStatusUser>[] = [
    {
      accessorKey: 'user_name',
      header: t('userHeader'),
      cell: ({ row }) => <span className="font-bold text-slate-800">{row.original.user_name || t('unnamed')}</span>,
    },
    {
      accessorKey: 'client_name',
      header: t('clientHeader'),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-slate-600">
          <Building2 size={13} className="text-slate-300" />
          <span>{row.original.client_name || t('noClient')}</span>
        </div>
      ),
    },
    {
      accessorKey: 'user_type',
      header: t('typeHeader'),
      cell: ({ row }) => (
        <span
          className={cn(
            BADGE_CLASS,
            row.original.user_type === USER_TYPES.STUDENT
              ? 'text-brand border-brand-100 bg-brand-50/30'
              : 'text-slate-500 border-slate-100 bg-slate-50',
          )}
        >
          <UserTypeLabel type={row.original.user_type} />
        </span>
      ),
    },
    {
      accessorKey: 'is_read',
      header: t('readStatusHeader'),
      cell: ({ row }) =>
        row.original.is_read ? (
          <span className={cn(BADGE_CLASS, 'bg-emerald-50 text-emerald-700 border-emerald-200')}>
            <CheckCircle2 size={10} /> {t('read')}
          </span>
        ) : (
          <span className={cn(BADGE_CLASS, 'bg-slate-100 text-slate-500 border-slate-200')}>
            <CircleDashed size={10} /> {t('unread')}
          </span>
        ),
    },
    {
      accessorKey: 'read_at',
      header: t('readAtHeader'),
      cell: ({ row }) => (
        <span className="font-mono text-[11px] text-slate-600">
          {row.original.read_at ? formatToJstDateTime(row.original.read_at) : <span className="text-slate-400">-</span>}
        </span>
      ),
    },
  ];
  if (!hasCta) return columns;
  return [
    ...columns,
    {
      accessorKey: 'cta_clicked_at',
      header: t('ctaClickedAtHeader'),
      cell: ({ row }) => (
        <span className="font-mono text-[11px] text-slate-600">
          {row.original.cta_clicked_at ? (
            formatToJstDateTime(row.original.cta_clicked_at)
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </span>
      ),
    },
  ];
}
