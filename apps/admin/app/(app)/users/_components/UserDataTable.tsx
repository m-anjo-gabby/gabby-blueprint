'use client';

import { useTranslations } from 'next-intl';
import type { ClientOption } from '@gabby/types/client';
import { USER_TYPES, type UserRecord } from '@gabby/types/user';
import { useUserTypeLabel } from '@/components/common/UserTypeLabel';
import { ClientFilter } from '@/components/list/ClientFilter';
import { DataTable } from '@/components/list/DataTable';
import { ListSelectFilter } from '@/components/list/ListSelectFilter';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { USER_LIST_FILTERS } from '../_lib/list';
import { createColumns } from './columns';

interface UserDataTableProps {
  data: UserRecord[];
  totalCount: number;
  pageCount: number;
  clients: ClientOption[];
}

export function UserDataTable({ data, totalCount, pageCount, clients }: UserDataTableProps) {
  const t = useTranslations('users.table');
  const userTypeLabel = useUserTypeLabel();
  const userTypeOptions = Object.values(USER_TYPES).map((value) => ({ value, label: userTypeLabel(value) }));
  const query = useListQuery(USER_LIST_FILTERS);

  return (
    <div>
      <ListToolbar
        query={query}
        searchPlaceholder={t('searchPlaceholder')}
        totalCount={totalCount}
        pageCount={pageCount}
      >
        <ListSelectFilter
          label={t('userType')}
          allLabel={t('allUserTypes')}
          options={userTypeOptions}
          value={query.filters.userType}
          onChange={(value) => query.setFilter('userType', value)}
        />
        <ClientFilter
          clients={clients}
          value={query.filters.clientId}
          onChange={(value) => query.setFilter('clientId', value)}
        />
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
