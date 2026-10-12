import Link from 'next/link';
import { ArrowLeft, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';
import { getCalendarEventSeries } from '@/actions/adminCalendarEventSeriesAction';
import { getCoachesFilter } from '@/actions/adminCalendarEventAction';
import { getClientsFilter } from '@/actions/adminClientAction';
import { CalendarEventDataTable } from '../../_components/CalendarEventDataTable';
import { SeriesFormDialog } from '../_components/SeriesFormDialog';
import { AddSeriesSessionsDialog } from './_components/AddSeriesSessionsDialog';
import { DeleteSeriesButton } from './_components/DeleteSeriesButton';

/**
 * シリーズの詳細。シリーズの説明と、属する回の一覧（開始日時の順。編集・参加者の確認はイベントの一覧と同じ操作）。
 * 「回をまとめて追加」で直近の回を引き継いで複数の回を登録し、「このシリーズを元に作成」で翌月分などのシリーズを作成画面（series/new?from=）で作る。
 */
export default async function CalendarEventSeriesDetailPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const t = await getTranslations('calendarEvents.series');
  const { seriesId } = await params;
  const [{ series, sessions }, coaches, clients] = await Promise.all([
    getCalendarEventSeries(seriesId),
    getCoachesFilter(),
    getClientsFilter(),
  ]);

  const backLink = (
    <Link
      href="/calendar-events/series"
      className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-brand transition-colors mb-2"
    >
      <ArrowLeft size={14} /> {t('backToList')}
    </Link>
  );

  if (!series) {
    return (
      <div className="p-6 space-y-4">
        {backLink}
        <p className="text-sm text-slate-500 font-bold">{t('notFound')}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        {backLink}
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{series.title}</h1>
            <p className="text-xs text-slate-500">{t('sessionCount', { count: sessions.length })}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SeriesFormDialog series={series} />
            <Link
              href={`/calendar-events/series/new?from=${series.series_id}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 gap-2 px-3 border-slate-200 text-slate-600 hover:bg-slate-50')}
            >
              <Copy size={14} />
              {t('copyButton')}
            </Link>
            <DeleteSeriesButton seriesId={series.series_id} title={series.title} />
            <AddSeriesSessionsDialog
              seriesId={series.series_id}
              sessions={sessions}
              coaches={coaches}
              clients={clients}
            />
          </div>
        </div>
        {series.description && (
          <p className="mt-4 max-w-3xl whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            {series.description}
          </p>
        )}
      </div>

      <CalendarEventDataTable data={sessions} hideSeries />
    </div>
  );
}
