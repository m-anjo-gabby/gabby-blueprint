'use client';

import { useTranslations } from 'next-intl';
import { CALENDAR_EVENT_TYPES, type CalendarEventItem } from '@gabby/types/calendarEvent';
import { ListSelectFilter } from '@/components/list/ListSelectFilter';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { CALENDAR_EVENT_LIST_FILTERS } from '../_lib/list';
import { CalendarEventTable } from './CalendarEventTable';

const EVENT_TYPE_OPTIONS = Object.entries(CALENDAR_EVENT_TYPES).map(([value, { label }]) => ({ value, label }));

interface CalendarEventDataTableProps {
  data: CalendarEventItem[];
  totalCount: number;
  pageCount: number;
}

export function CalendarEventDataTable({ data, totalCount, pageCount }: CalendarEventDataTableProps) {
  const t = useTranslations('calendarEvents.dataTable');
  const query = useListQuery(CALENDAR_EVENT_LIST_FILTERS);
  const statusOptions = [
    { value: 'published', label: t('published') },
    { value: 'draft', label: t('draft') },
  ];

  return (
    <div>
      <ListToolbar query={query} searchPlaceholder={t('searchPlaceholder')} totalCount={totalCount} pageCount={pageCount}>
        <ListSelectFilter
          label={t('typeHeader')}
          allLabel={t('allTypes')}
          options={EVENT_TYPE_OPTIONS}
          value={query.filters.type}
          onChange={(value) => query.setFilter('type', value)}
        />
        <ListSelectFilter
          label={t('publishStatusHeader')}
          allLabel={t('allStatuses')}
          options={statusOptions}
          value={query.filters.status}
          onChange={(value) => query.setFilter('status', value)}
          className="w-32"
        />
      </ListToolbar>
      <CalendarEventTable data={data} pending={query.isPending} />
    </div>
  );
}
