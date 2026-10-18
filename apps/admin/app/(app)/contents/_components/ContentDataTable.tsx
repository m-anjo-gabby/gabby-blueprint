'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CONTENT_TYPES, type Content } from '@gabby/types/content';
import { DataTable } from '@/components/list/DataTable';
import { ListSelectFilter } from '@/components/list/ListSelectFilter';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { CONTENT_LIST_FILTERS, saveContentsListQuery } from '../_lib/listQuery';
import { createColumns } from './columns';

const CONTENT_TYPE_OPTIONS = Object.entries(CONTENT_TYPES).map(([value, { label }]) => ({ value, label }));

interface ContentDataTableProps {
  data: Content[];
  totalCount: number;
  pageCount: number;
}

export function ContentDataTable({ data, totalCount, pageCount }: ContentDataTableProps) {
  const t = useTranslations('contents.dataTable');
  const query = useListQuery(CONTENT_LIST_FILTERS);

  // エディタから戻った際に同じ条件で一覧を表示できるよう、現在の条件を保存する
  const queryString = useSearchParams().toString();
  useEffect(() => {
    saveContentsListQuery(queryString);
  }, [queryString]);

  return (
    <div>
      <ListToolbar
        query={query}
        searchPlaceholder={t('searchPlaceholder')}
        totalCount={totalCount}
        pageCount={pageCount}
      >
        <ListSelectFilter
          label={t('typeHeader')}
          allLabel={t('typeFilterAllOption')}
          options={CONTENT_TYPE_OPTIONS}
          value={query.filters.type}
          onChange={(value) => query.setFilter('type', value)}
        />
      </ListToolbar>
      <DataTable
        columns={createColumns(t)}
        data={data}
        getRowId={(row) => row.content_id}
        emptyMessage={t('noData')}
        pending={query.isPending}
      />
    </div>
  );
}
