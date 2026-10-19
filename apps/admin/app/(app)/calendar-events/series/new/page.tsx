import { getTranslations } from 'next-intl/server';
import { getCoachesFilter } from '@/actions/adminCalendarEventAction';
import { getCalendarEventSeries } from '@/actions/adminCalendarEventSeriesAction';
import { getClientsFilter } from '@/actions/adminClientAction';
import { PageHeader } from '@/components/common/PageHeader';
import { sessionsAfter, sessionsCopiedFrom } from '../_lib/seriesSessions';
import { SeriesCreateForm } from './_components/SeriesCreateForm';

/**
 * シリーズの作成。シリーズ名・説明と回をまとめて登録する。
 * `?from=<seriesId>` は「このシリーズを元に作成」（翌月分など）: シリーズ名・説明と、各回の時刻・担当コーチ・共通設定を引き継ぎ、
 * 日付を元のシリーズの最後の回の1週間後から並べ直す。
 */
export default async function CalendarEventSeriesNewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
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
    <div className="space-y-6">
      <PageHeader
        back={{ href: backHref, label: sourceSeries ? t('backToSource') : t('backToList') }}
        title={sourceSeries ? t('copyPageTitle') : t('createTitle')}
        description={sourceSeries ? t('copyHint', { title: sourceSeries.title }) : t('createSubtitle')}
      />

      <SeriesCreateForm initialValues={initialValues} cancelHref={backHref} coaches={coaches} clients={clients} />
    </div>
  );
}
