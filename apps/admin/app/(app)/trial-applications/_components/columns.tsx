'use client';

import Link from 'next/link';
import type { ListColumnDef } from '@/components/list/listTable';
import type { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import {
  formatTrialOccupation,
  formatTrialReferralSource,
  type TrialApplicationRow,
  type TrialApplicationStatus,
} from '@gabby/types/trialApplication';

type TableT = ReturnType<typeof useTranslations<'trialApplications.dataTable'>>;

const STATUS_BADGE_CLASS: Record<TrialApplicationStatus, string> = {
  invited: 'bg-amber-50 text-amber-700 border-amber-200',
  registered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
};

const formatJst = (value: string | null) => formatDateTimeByZone(value, 'Asia/Tokyo', false);

export function createColumns(t: TableT, locale: 'ja' | 'en'): ListColumnDef<TrialApplicationRow>[] {
  return [
    {
      accessorKey: 'last_applied_at',
      header: t('appliedAtHeader'),
      cell: ({ row }) => (
        <div className="whitespace-nowrap text-slate-600">
          {formatJst(row.original.last_applied_at)}
          {row.original.apply_count > 1 && (
            <span className="block text-xs text-slate-400">{t('applyCount', { count: row.original.apply_count })}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'full_name',
      header: t('nameHeader'),
      cell: ({ row }) => {
        const { full_name, full_name_latin, email, user_id } = row.original;
        return (
          <div className="min-w-0">
            {user_id ? (
              <Link href={`/users/${user_id}`} className="font-bold text-slate-700 hover:text-brand">
                {full_name}
              </Link>
            ) : (
              <span className="font-bold text-slate-700">{full_name}</span>
            )}
            <span className="block text-xs text-slate-500">{full_name_latin}</span>
            <span className="block truncate text-xs text-slate-500">{email}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'occupation',
      header: t('occupationHeader'),
      cell: ({ row }) => (
        <span className="text-slate-600">
          {formatTrialOccupation(row.original.occupation, row.original.occupation_other, locale)}
        </span>
      ),
    },
    {
      accessorKey: 'referral_source',
      header: t('referralHeader'),
      cell: ({ row }) => (
        <span className="text-slate-600">
          {formatTrialReferralSource(row.original.referral_source, row.original.referral_source_other, locale)}
        </span>
      ),
    },
    {
      accessorKey: 'country_city',
      header: t('locationHeader'),
      cell: ({ row }) => (
        <div className="text-xs text-slate-600">
          {row.original.country_city || '—'}
          <span className="block text-slate-400">{row.original.timezone}</span>
        </div>
      ),
    },
    {
      accessorKey: 'message',
      header: t('messageHeader'),
      cell: ({ row }) =>
        row.original.message ? (
          <p
            className="max-w-xs whitespace-pre-wrap break-words text-xs text-slate-600 line-clamp-3"
            title={row.original.message}
          >
            {row.original.message}
          </p>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      accessorKey: 'status',
      header: t('statusHeader'),
      cell: ({ row }) => {
        const { status, accepted_at, invitation_expires_at } = row.original;
        const sub =
          status === 'registered' && accepted_at
            ? t('acceptedAt', { date: formatJst(accepted_at) })
            : status === 'invited' && invitation_expires_at
              ? t('expiresAt', { date: formatJst(invitation_expires_at) })
              : null;
        return (
          <div className="whitespace-nowrap">
            <span className={cn('rounded-md border px-2 py-1 text-xs font-bold', STATUS_BADGE_CLASS[status])}>
              {t(`status.${status}`)}
            </span>
            {sub && <span className="mt-1 block text-xs text-slate-400">{sub}</span>}
          </div>
        );
      },
    },
  ];
}
