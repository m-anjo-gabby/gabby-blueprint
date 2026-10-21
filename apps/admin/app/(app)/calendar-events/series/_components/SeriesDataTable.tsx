'use client';

import { useTranslations } from 'next-intl';
import type { CalendarEventSeriesItem } from '@gabby/types/calendarEvent';
import { DataTable } from '@/components/list/DataTable';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { paginateLocally } from '@/lib/list';
import { createColumns } from './columns';

/** 検索の対象（シリーズ名） */
const toSearchText = (series: CalendarEventSeriesItem) => series.title;

interface SeriesDataTableProps {
  /** 全件（シリーズは月に数件のため、検索・ページ分けはブラウザ側で行う） */
  data: CalendarEventSeriesItem[];
}

export function SeriesDataTable({ data }: SeriesDataTableProps) {
  const t = useTranslations('calendarEvents.series');
  const query = useListQuery([], { shallow: true });
  const list = paginateLocally(data, query, toSearchText);

  return (
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
        getRowId={(row) => row.series_id}
        emptyMessage={t('noSeries')}
      />
    </div>
  );
}
