import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { getCalendarEventSeriesList } from '@/actions/adminCalendarEventSeriesAction';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SeriesFormDialog } from './_components/SeriesFormDialog';

/**
 * グループセッションのシリーズ（企画。例: 「10月の発音グループセッション」）の一覧。
 * 行を開くとシリーズの詳細（回の一覧・回をまとめて追加）へ移る。
 */
export default async function CalendarEventSeriesPage() {
  const t = await getTranslations('calendarEvents.series');
  const seriesList = await getCalendarEventSeriesList();

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link
          href="/calendar-events"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-brand transition-colors mb-2"
        >
          <ArrowLeft size={14} /> {t('backToEvents')}
        </Link>
        <div className="flex justify-between items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{t('listTitle')}</h1>
            <p className="text-xs text-slate-500 mt-1">{t('listSubtitle')}</p>
          </div>
          <SeriesFormDialog mode="create" />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-slate-600 font-bold py-3 px-4 text-xs">{t('titleHeader')}</TableHead>
              <TableHead className="text-slate-600 font-bold py-3 px-4 text-xs">{t('sessionCountHeader')}</TableHead>
              <TableHead className="text-slate-600 font-bold py-3 px-4 text-xs">{t('nextSessionHeader')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {seriesList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-slate-400">
                  {t('noSeries')}
                </TableCell>
              </TableRow>
            ) : (
              seriesList.map((series) => (
                <TableRow key={series.series_id} className="hover:bg-slate-50/40 border-slate-100">
                  <TableCell className="py-3 px-4">
                    <Link href={`/calendar-events/series/${series.series_id}`} className="font-bold text-slate-700 hover:text-brand">
                      {series.title}
                    </Link>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-slate-600 tabular-nums">{t('sessionCount', { count: series.session_count })}</TableCell>
                  <TableCell className="py-3 px-4 text-slate-600">
                    {series.next_start_datetime ? formatDateTimeByZone(series.next_start_datetime, 'Asia/Tokyo', false) : t('noUpcoming')}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right">
                    <Link
                      href={`/calendar-events/series/${series.series_id}`}
                      aria-label={t('openSeries', { title: series.title })}
                      className="inline-flex text-slate-400 hover:text-brand"
                    >
                      <ChevronRight size={16} />
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
