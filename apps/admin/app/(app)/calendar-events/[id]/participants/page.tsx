// apps/admin/app/(app)/calendar-events/[id]/participants/page.tsx
import { getTranslations } from 'next-intl/server';
import { getCalendarEventMessages, getCalendarEventParticipants } from '@/actions/adminCalendarEventAction';
import { BackLink, PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarEventAnnouncementPanel } from './_components/CalendarEventAnnouncementPanel';
import { CalendarEventParticipantsTable } from './_components/CalendarEventParticipantsTable';

/**
 * カレンダーイベントの参加者・アナウンス管理。
 * 戻り先は入口に合わせる: シリーズの詳細から開いた場合（?from=series）はそのシリーズの詳細、それ以外はカレンダーイベント管理。
 * 戻り先のパスは URL から受け取らず、イベントの series_id から作る（シリーズから外れていればカレンダーイベント管理）。
 */
export default async function CalendarEventParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const t = await getTranslations('calendarEvents.participantsPage');
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const [{ event, participants }, messages] = await Promise.all([
    getCalendarEventParticipants(id),
    getCalendarEventMessages(id),
  ]);

  const backSeries = from === 'series' ? (event?.series ?? null) : null;
  const back = backSeries
    ? { href: `/calendar-events/series/${backSeries.series_id}`, label: t('backToSeries', { title: backSeries.title }) }
    : { href: '/calendar-events', label: t('backToList') };

  if (!event) {
    return (
      <div className="space-y-4">
        <BackLink {...back} />
        <p className="text-sm text-slate-500 font-bold">{t('notFound')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={t('title', { title: event.title })} description={t('subtitle')} />

      <Tabs defaultValue="participants">
        <TabsList>
          <TabsTrigger value="participants">{t('tabParticipants')}</TabsTrigger>
          <TabsTrigger value="announcements">{t('tabAnnouncements')}</TabsTrigger>
        </TabsList>
        <TabsContent value="participants">
          <CalendarEventParticipantsTable data={participants} />
        </TabsContent>
        <TabsContent value="announcements">
          <CalendarEventAnnouncementPanel calendarEventId={id} initialMessages={messages} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
