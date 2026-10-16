'use client';

import { useLocale, useTranslations } from 'next-intl';
import { TRIAL_APPLICATION_STATUSES, TRIAL_OCCUPATIONS, type TrialApplicationRow } from '@gabby/types/trialApplication';
import { DataTable } from '@/components/list/DataTable';
import { ListSelectFilter } from '@/components/list/ListSelectFilter';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { TRIAL_APPLICATION_LIST_FILTERS } from '../_lib/list';
import { createColumns } from './columns';

interface TrialApplicationDataTableProps {
  data: TrialApplicationRow[];
  totalCount: number;
  pageCount: number;
}

export function TrialApplicationDataTable({ data, totalCount, pageCount }: TrialApplicationDataTableProps) {
  const t = useTranslations('trialApplications.dataTable');
  const locale = useLocale() === 'en' ? 'en' : 'ja';
  const query = useListQuery(TRIAL_APPLICATION_LIST_FILTERS);
  const statusOptions = TRIAL_APPLICATION_STATUSES.map((status) => ({ value: status, label: t(`status.${status}`) }));
  const occupationOptions = TRIAL_OCCUPATIONS.map((o) => ({ value: String(o.code), label: locale === 'en' ? o.labelEn : o.label }));

  return (
    <div>
      <ListToolbar query={query} searchPlaceholder={t('searchPlaceholder')} totalCount={totalCount} pageCount={pageCount}>
        <ListSelectFilter
          label={t('statusHeader')}
          allLabel={t('allStatuses')}
          options={statusOptions}
          value={query.filters.status}
          onChange={(value) => query.setFilter('status', value)}
          className="w-32"
        />
        <ListSelectFilter
          label={t('occupationHeader')}
          allLabel={t('allOccupations')}
          options={occupationOptions}
          value={query.filters.occupation}
          onChange={(value) => query.setFilter('occupation', value)}
        />
      </ListToolbar>
      <DataTable
        columns={createColumns(t, locale)}
        data={data}
        getRowId={(row) => row.application_id}
        emptyMessage={t('noData')}
        pending={query.isPending}
      />
    </div>
  );
}
