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
        <CalendarEventFormDialog />
      </div>

      {/* 一覧テーブル */}
      <CalendarEventDataTable data={events} />
    </div>
  );
}
