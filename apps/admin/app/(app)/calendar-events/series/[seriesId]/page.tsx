import Link from 'next/link';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackLink, PageHeader } from '@/components/common/PageHeader';
import { getTranslations } from 'next-intl/server';
import { getCalendarEventSeries } from '@/actions/adminCalendarEventSeriesAction';
import { getCoachesFilter } from '@/actions/adminCalendarEventAction';
import { getClientsFilter } from '@/actions/adminClientAction';
import { CalendarEventTable } from '../../_components/CalendarEventTable';
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

  const back = { href: '/calendar-events/series', label: t('backToList') };

  if (!series) {
    return (
      <div className="space-y-4">
        <BackLink {...back} />
        <p className="text-sm text-slate-500 font-bold">{t('notFound')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <PageHeader
          back={back}
          title={series.title}
          description={t('sessionCount', { count: sessions.length })}
          actions={
            <>
              <SeriesFormDialog series={series} />
              <Button variant="outline" size="sm" asChild>
                <Link href={`/calendar-events/series/new?from=${series.series_id}`}>
                  <Copy /> {t('copyButton')}
                </Link>
              </Button>
              <DeleteSeriesButton seriesId={series.series_id} title={series.title} />
              <AddSeriesSessionsDialog
                seriesId={series.series_id}
                sessions={sessions}
                coaches={coaches}
                clients={clients}
              />
            </>
          }
        />
        {series.description && (
          <p className="max-w-3xl whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            {series.description}
          </p>
        )}
      </div>

      <CalendarEventTable data={sessions} formOptions={{ clients, coaches }} hideSeries standalone />
    </div>
  );
}
