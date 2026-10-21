'use client';

import { useTranslations } from 'next-intl';
import type { CalendarEventParticipant } from '@/actions/adminCalendarEventAction';
import { DataTable } from '@/components/list/DataTable';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { paginateLocally } from '@/lib/list';
import { createColumns } from './columns';

/** 検索の対象（氏名） */
const toSearchText = (participant: CalendarEventParticipant) => participant.user_name ?? '';

interface CalendarEventParticipantsTableProps {
  /** 全件（参加者は1回あたり少人数のため、検索・ページ分けはブラウザ側で行う） */
  data: CalendarEventParticipant[];
}

export function CalendarEventParticipantsTable({ data }: CalendarEventParticipantsTableProps) {
  const t = useTranslations('calendarEvents.participantsTable');
  const query = useListQuery([], { shallow: true });
  const list = paginateLocally(data, query, toSearchText);

  return (
    <div className="space-y-4">
      <div className="w-fit rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{t('participantCount')}</p>
        <p className="mt-1 text-2xl font-black text-slate-800">{data.length}</p>
      </div>

      <div>
        <ListToolbar
          query={query}
          searchPlaceholder={t('searchPlaceholder')}
          totalCount={list.totalCount}
          pageCount={list.pageCount}
          page={list.page}
        />
        <DataTable
          columns={createColumns(t)}
          data={list.rows}
          getRowId={(row) => row.participant_id}
          emptyMessage={t('noParticipants')}
        />
      </div>
    </div>
  );
}
