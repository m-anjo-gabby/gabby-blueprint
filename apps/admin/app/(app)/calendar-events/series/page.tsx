import { PlusCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getCalendarEventSeriesList } from '@/actions/adminCalendarEventSeriesAction';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { SeriesDataTable } from './_components/SeriesDataTable';

/**
 * グループセッションのシリーズ（企画。例: 「10月の発音グループセッション」）の一覧。
 * タイトル・「回の管理・詳細」ボタンでシリーズの詳細（回の一覧・回をまとめて追加）へ移る。
 */
export default async function CalendarEventSeriesPage() {
  const [t, seriesList] = await Promise.all([getTranslations('calendarEvents.series'), getCalendarEventSeriesList()]);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/calendar-events', label: t('backToEvents') }}
        title={t('listTitle')}
        description={t('listSubtitle')}
        actions={
          <Button asChild>
            <Link href="/calendar-events/series/new">
              <PlusCircle /> {t('createButton')}
            </Link>
          </Button>
        }
      />
      <SeriesDataTable data={seriesList} />
    </div>
  );
}
