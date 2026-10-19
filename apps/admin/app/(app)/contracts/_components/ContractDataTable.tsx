'use client';

import { useTranslations } from 'next-intl';
import type { ClientOption } from '@gabby/types/client';
import type { ContractDetail } from '@gabby/types/contract';
import { ClientFilter } from '@/components/list/ClientFilter';
import { DataTable } from '@/components/list/DataTable';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { CONTRACT_LIST_FILTERS } from '../_lib/list';
import { createColumns } from './columns';

interface ContractDataTableProps {
  data: ContractDetail[];
  totalCount: number;
  pageCount: number;
  clients: ClientOption[];
}

export function ContractDataTable({ data, totalCount, pageCount, clients }: ContractDataTableProps) {
  const t = useTranslations('contracts.table');
  const query = useListQuery(CONTRACT_LIST_FILTERS);

  return (
    <div>
      <ListToolbar
        query={query}
        searchPlaceholder={t('searchPlaceholder')}
        totalCount={totalCount}
        pageCount={pageCount}
      >
        <ClientFilter
          clients={clients}
          value={query.filters.clientId}
          onChange={(value) => query.setFilter('clientId', value)}
        />
      </ListToolbar>
      <DataTable
        columns={createColumns(t)}
        data={data}
        getRowId={(row) => row.contract_id}
        emptyMessage={t('noData')}
        pending={query.isPending}
      />
    </div>
  );
}
