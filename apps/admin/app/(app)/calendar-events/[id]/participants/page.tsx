// apps/admin/app/(app)/calendar-events/[id]/participants/page.tsx
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getCalendarEventParticipants, getCalendarEventMessages } from '@/actions/adminCalendarEventAction';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarEventParticipantsTable } from './_components/CalendarEventParticipantsTable';
import { CalendarEventAnnouncementPanel } from './_components/CalendarEventAnnouncementPanel';

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
  const [{ event, participants, totalCount }, messages] = await Promise.all([
    getCalendarEventParticipants(id),
    getCalendarEventMessages(id),
  ]);

  const backSeries = from === 'series' ? (event?.series ?? null) : null;
  const backLink = (
    <Link
      href={backSeries ? `/calendar-events/series/${backSeries.series_id}` : '/calendar-events'}
      className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-brand transition-colors mb-2"
    >
      <ArrowLeft size={14} /> {backSeries ? t('backToSeries', { title: backSeries.title }) : t('backToList')}
    </Link>
  );

  if (!event) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className="text-sm text-slate-500 font-bold">{t('notFound')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        {backLink}
        <h1 className="text-xl font-bold text-slate-800 tracking-tight line-clamp-1">{t('title', { title: event.title })}</h1>
        <p className="text-[13px] text-slate-500 mt-1">{t('subtitle')}</p>
      </div>

      <Tabs defaultValue="participants">
        <TabsList>
          <TabsTrigger value="participants">{t('tabParticipants')}</TabsTrigger>
          <TabsTrigger value="announcements">{t('tabAnnouncements')}</TabsTrigger>
        </TabsList>
        <TabsContent value="participants">
          <CalendarEventParticipantsTable data={participants} totalCount={totalCount} />
        </TabsContent>
        <TabsContent value="announcements">
          <CalendarEventAnnouncementPanel calendarEventId={id} initialMessages={messages} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
