'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import type { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import type { CalendarEventSeriesItem } from '@gabby/types/calendarEvent';

type SeriesT = ReturnType<typeof useTranslations<'calendarEvents.series'>>;

export function createColumns(t: SeriesT): ColumnDef<CalendarEventSeriesItem>[] {
  return [
    {
      accessorKey: 'title',
      header: t('titleHeader'),
      cell: ({ row }) => (
        <Link href={`/calendar-events/series/${row.original.series_id}`} className="font-bold text-slate-700 hover:text-brand">
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: 'session_count',
      header: t('sessionCountHeader'),
      cell: ({ row }) => <span className="tabular-nums text-slate-600">{t('sessionCount', { count: row.original.session_count })}</span>,
    },
    {
      accessorKey: 'next_start_datetime',
      header: t('nextSessionHeader'),
      cell: ({ row }) => (
        <span className="text-slate-600">
          {row.original.next_start_datetime ? formatDateTimeByZone(row.original.next_start_datetime, 'Asia/Tokyo', false) : t('noUpcoming')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <div className="text-right">
          <Link
            href={`/calendar-events/series/${row.original.series_id}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 gap-1 whitespace-nowrap')}
          >
            {t('manageSessions')}
            <ChevronRight size={14} />
          </Link>
        </div>
      ),
    },
  ];
}
