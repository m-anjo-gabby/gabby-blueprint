import Link from 'next/link';
import { Layers } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getCalendarEvents } from '@/actions/adminCalendarEventAction';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { CalendarEventDataTable } from './_components/CalendarEventDataTable';
import { CalendarEventFormDialog } from './_components/CalendarEventFormDialog';

export default async function CalendarEventsPage() {
  const [t, events] = await Promise.all([getTranslations('calendarEvents.page'), getCalendarEvents()]);

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
      <CalendarEventDataTable data={events} />
    </div>
  );
}
