// apps/admin/app/(app)/calendar-events/[id]/participants/page.tsx
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCalendarEventParticipants, getCalendarEventMessages } from '@/actions/adminCalendarEventAction';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarEventParticipantsTable } from './_components/CalendarEventParticipantsTable';
import { CalendarEventAnnouncementPanel } from './_components/CalendarEventAnnouncementPanel';

export default async function CalendarEventParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ event, participants, totalCount }, messages] = await Promise.all([
    getCalendarEventParticipants(id),
    getCalendarEventMessages(id),
  ]);

  if (!event) {
    return (
      <div className="space-y-4">
        <Link
          href="/calendar-events"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft size={14} /> カレンダーイベント一覧に戻る
        </Link>
        <p className="text-sm text-slate-500 font-bold">カレンダーイベントが見つかりません。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/calendar-events"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors mb-2"
        >
          <ArrowLeft size={14} /> カレンダーイベント一覧に戻る
        </Link>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight line-clamp-1">参加者・アナウンス管理: {event.title}</h1>
        <p className="text-[13px] text-slate-500 mt-1">参加登録済みの生徒/コーチの確認と、参加者・担当コーチへのアナウンス配信を行います。</p>
      </div>

      <Tabs defaultValue="participants">
        <TabsList>
          <TabsTrigger value="participants">参加者一覧</TabsTrigger>
          <TabsTrigger value="announcements">アナウンス</TabsTrigger>
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
