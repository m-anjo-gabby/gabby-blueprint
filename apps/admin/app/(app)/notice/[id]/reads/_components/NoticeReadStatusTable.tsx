'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { USER_TYPES } from '@gabby/types/user';
import type { ClientOption } from '@gabby/types/client';
import type { NoticeReadStatusUser } from '@/actions/adminNoticeAction';
import { ClientFilter } from '@/components/list/ClientFilter';
import { DataTable } from '@/components/list/DataTable';
import { ListSelectFilter } from '@/components/list/ListSelectFilter';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { NOTICE_READ_LIST_FILTERS } from '../_lib/list';
import { createColumns } from './columns';

interface NoticeReadStatusTableProps {
  data: NoticeReadStatusUser[];
  totalCount: number;
  pageCount: number;
  readCount: number;
  unreadCount: number;
  clients: ClientOption[];
}

export function NoticeReadStatusTable({ data, totalCount, pageCount, readCount, unreadCount, clients }: NoticeReadStatusTableProps) {
  const t = useTranslations('notice.readsTable');
  const query = useListQuery(NOTICE_READ_LIST_FILTERS);
  const readRate = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;
  const userTypeOptions = [
    { value: USER_TYPES.STUDENT, label: t('studentType') },
    { value: USER_TYPES.COACH, label: t('coachType') },
  ];

  return (
    <div className="space-y-4">
      {/* 集計（絞り込み後の対象者） */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label={t('targetUsers')}>{totalCount}</SummaryTile>
        <SummaryTile label={t('read')} tone="emerald">
          {readCount}
          <span className="ml-1.5 text-xs font-bold text-slate-400">({readRate}%)</span>
        </SummaryTile>
        <SummaryTile label={t('unread')}>{unreadCount}</SummaryTile>
      </div>

      <div>
        <ListToolbar query={query} searchPlaceholder={t('searchPlaceholder')} totalCount={totalCount} pageCount={pageCount}>
          <ClientFilter clients={clients} value={query.filters.clientId} onChange={(value) => query.setFilter('clientId', value)} />
          <ListSelectFilter
            label={t('typeHeader')}
            allLabel={t('allTypes')}
            options={userTypeOptions}
            value={query.filters.userType}
            onChange={(value) => query.setFilter('userType', value)}
            className="w-32"
          />
        </ListToolbar>
        <DataTable columns={createColumns(t)} data={data} getRowId={(row) => row.id} emptyMessage={t('noUsers')} pending={query.isPending} />
      </div>
    </div>
  );
}

function SummaryTile({ label, tone, children }: { label: string; tone?: 'emerald'; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className={cn('text-[10px] font-black uppercase tracking-widest', tone === 'emerald' ? 'text-emerald-500' : 'text-slate-400')}>{label}</p>
      <p className={cn('mt-1 text-2xl font-black', tone === 'emerald' ? 'text-emerald-600' : 'text-slate-800')}>{children}</p>
    </div>
  );
}
