'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ClientRecord } from '@gabby/types/client';
import { DataTable } from '@/components/list/DataTable';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { createColumns } from './columns';

interface ClientDataTableProps {
  data: ClientRecord[];
  totalCount: number;
  pageCount: number;
}

export function ClientDataTable({ data, totalCount, pageCount }: ClientDataTableProps) {
  const t = useTranslations('clients.table');
  const locale = useLocale();
  const query = useListQuery();

  return (
    <div>
      <ListToolbar
        query={query}
        searchPlaceholder={t('searchPlaceholder')}
        totalCount={totalCount}
        pageCount={pageCount}
      />
      <DataTable
        columns={createColumns(t, locale)}
        data={data}
        getRowId={(row) => row.client_id}
        emptyMessage={t('noData')}
        pending={query.isPending}
      />
    </div>
  );
}
