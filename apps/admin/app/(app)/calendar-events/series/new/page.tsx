import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getCalendarEventSeries } from '@/actions/adminCalendarEventSeriesAction';
import { getCoachesFilter } from '@/actions/adminCalendarEventAction';
import { getClientsFilter } from '@/actions/adminClientAction';
import { sessionsAfter, sessionsCopiedFrom } from '../_lib/seriesSessions';
import { SeriesCreateForm } from './_components/SeriesCreateForm';

/**
 * シリーズの作成。シリーズ名・説明と回をまとめて登録する。
 * `?from=<seriesId>` は「このシリーズを元に作成」（翌月分など）: シリーズ名・説明と、各回の時刻・担当コーチ・共通設定を引き継ぎ、
 * 日付を元のシリーズの最後の回の1週間後から並べ直す。
 */
export default async function CalendarEventSeriesNewPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const t = await getTranslations('calendarEvents.series');
  const { from } = await searchParams;
  const [source, coaches, clients] = await Promise.all([
    from ? getCalendarEventSeries(from) : null,
    getCoachesFilter(),
    getClientsFilter(),
  ]);
  const sourceSeries = source?.series ?? null;

  const initialValues = sourceSeries
    ? {
        title: t('copyTitle', { title: sourceSeries.title }),
        description: sourceSeries.description ?? '',
        ...sessionsCopiedFrom(source?.sessions ?? []),
      }
    : { title: '', description: '', ...sessionsAfter([]) };
  const backHref = sourceSeries ? `/calendar-events/series/${sourceSeries.series_id}` : '/calendar-events/series';

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-brand transition-colors mb-2"
        >
          <ArrowLeft size={14} /> {sourceSeries ? t('backToSource') : t('backToList')}
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{sourceSeries ? t('copyPageTitle') : t('createTitle')}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {sourceSeries ? t('copyHint', { title: sourceSeries.title }) : t('createSubtitle')}
          </p>
        </div>
      </div>

      <SeriesCreateForm initialValues={initialValues} cancelHref={backHref} coaches={coaches} clients={clients} />
    </div>
  );
}
