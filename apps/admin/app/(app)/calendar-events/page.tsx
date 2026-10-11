import Link from 'next/link';
import { Layers } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getCalendarEventList, getCoachesFilter } from '@/actions/adminCalendarEventAction';
import { getClientsFilter } from '@/actions/adminClientAction';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { CalendarEventDataTable } from './_components/CalendarEventDataTable';
import { CalendarEventFormDialog } from './_components/CalendarEventFormDialog';
import { CALENDAR_EVENT_LIST_FILTERS } from './_lib/list';

export default async function CalendarEventsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [t, params] = await Promise.all([getTranslations('calendarEvents.page'), searchParams]);
  // 登録・編集ダイアログの選択肢は、ダイアログごとにブラウザから取らず、ここで1回だけ取得して渡す
  const [{ rows, totalCount }, clients, coaches] = await Promise.all([
    getCalendarEventList(parseListParams(params, CALENDAR_EVENT_LIST_FILTERS)),
    getClientsFilter(),
    getCoachesFilter(),
  ]);
  const formOptions = { clients, coaches };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/calendar-events/series">
                <Layers /> {t('seriesLink')}
              </Link>
            </Button>
            <CalendarEventFormDialog options={formOptions} />
          </>
        }
      />
      <CalendarEventDataTable data={rows} totalCount={totalCount} pageCount={toPageCount(totalCount)} formOptions={formOptions} />
    </div>
  );
}
