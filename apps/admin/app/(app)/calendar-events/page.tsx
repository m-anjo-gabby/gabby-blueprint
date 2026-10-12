import Link from 'next/link';
import { Layers } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getCalendarEvents } from '@/actions/adminCalendarEventAction';
import { CalendarEventDataTable } from './_components/CalendarEventDataTable';
import { CalendarEventFormDialog } from './_components/CalendarEventFormDialog';

export default async function CalendarEventsPage() {
  const t = await getTranslations('calendarEvents.page');
  const events = await getCalendarEvents();

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/calendar-events/series"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <Layers size={16} /> {t('seriesLink')}
          </Link>
          <CalendarEventFormDialog />
        </div>
      </div>

      {/* 一覧テーブル */}
      <CalendarEventDataTable data={events} />
    </div>
  );
}
