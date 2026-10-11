import Link from 'next/link';
import { Layers } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getCalendarEventList } from '@/actions/adminCalendarEventAction';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { CalendarEventDataTable } from './_components/CalendarEventDataTable';
import { CalendarEventFormDialog } from './_components/CalendarEventFormDialog';
import { CALENDAR_EVENT_LIST_FILTERS } from './_lib/list';

export default async function CalendarEventsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [t, params] = await Promise.all([getTranslations('calendarEvents.page'), searchParams]);
  const { rows, totalCount } = await getCalendarEventList(parseListParams(params, CALENDAR_EVENT_LIST_FILTERS));

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
            <CalendarEventFormDialog />
          </>
        }
      />
      <CalendarEventDataTable data={rows} totalCount={totalCount} pageCount={toPageCount(totalCount)} />
    </div>
  );
}
