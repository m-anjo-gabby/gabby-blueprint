'use client';

import { useTranslations } from 'next-intl';
import type { ClientOption } from '@gabby/types/client';
import { USER_TYPE_MAP, type UserRecord } from '@gabby/types/user';
import { ClientFilter } from '@/components/list/ClientFilter';
import { DataTable } from '@/components/list/DataTable';
import { ListSelectFilter } from '@/components/list/ListSelectFilter';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { USER_LIST_FILTERS } from '../_lib/list';
import { createColumns } from './columns';

const USER_TYPE_OPTIONS = Object.entries(USER_TYPE_MAP).map(([value, label]) => ({ value, label }));

interface UserDataTableProps {
  data: UserRecord[];
  totalCount: number;
  pageCount: number;
  clients: ClientOption[];
}

export function UserDataTable({ data, totalCount, pageCount, clients }: UserDataTableProps) {
  const t = useTranslations('users.table');
  const query = useListQuery(USER_LIST_FILTERS);

  return (
    <div>
      <ListToolbar query={query} searchPlaceholder={t('searchPlaceholder')} totalCount={totalCount} pageCount={pageCount}>
        <ListSelectFilter
          label={t('userType')}
          allLabel={t('allUserTypes')}
          options={USER_TYPE_OPTIONS}
          value={query.filters.userType}
          onChange={(value) => query.setFilter('userType', value)}
        />
        <ClientFilter clients={clients} value={query.filters.clientId} onChange={(value) => query.setFilter('clientId', value)} />
      </ListToolbar>
      <DataTable
        columns={createColumns(t)}
        data={data}
        getRowId={(row) => row.id}
        emptyMessage={t('noData')}
        pending={query.isPending}
      />
    </div>
  );
}
