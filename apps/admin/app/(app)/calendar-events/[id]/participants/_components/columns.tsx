'use client';

import type { ListColumnDef } from '@/components/list/listTable';
import type { useTranslations } from 'next-intl';
import { getUserTypeLabel } from '@gabby/types/user';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import type { CalendarEventParticipant } from '@/actions/adminCalendarEventAction';

type TableT = ReturnType<typeof useTranslations<'calendarEvents.participantsTable'>>;

export function createColumns(t: TableT): ListColumnDef<CalendarEventParticipant>[] {
  return [
    {
      accessorKey: 'user_name',
      header: t('nameHeader'),
      cell: ({ row }) => <span className="font-bold text-slate-700">{row.original.user_name || t('unknown')}</span>,
    },
    {
      accessorKey: 'user_type',
      header: t('typeHeader'),
      cell: ({ row }) => <span className="text-slate-600">{getUserTypeLabel(row.original.user_type)}</span>,
    },
    {
      accessorKey: 'insert_date',
      header: t('registeredAtHeader'),
      cell: ({ row }) => <span className="text-slate-500">{formatDateTimeByZone(row.original.insert_date)}</span>,
    },
  ];
}
