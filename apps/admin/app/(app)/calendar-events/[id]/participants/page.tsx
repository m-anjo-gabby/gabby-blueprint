// apps/admin/app/(app)/calendar-events/[id]/participants/page.tsx
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCalendarEventParticipants } from '@/actions/adminCalendarEventAction';
import { CalendarEventParticipantsTable } from './_components/CalendarEventParticipantsTable';

export default async function CalendarEventParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, participants, totalCount } = await getCalendarEventParticipants(id);

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
        <h1 className="text-xl font-bold text-slate-800 tracking-tight line-clamp-1">参加者一覧: {event.title}</h1>
        <p className="text-[13px] text-slate-500 mt-1">このカレンダーイベントに参加登録している生徒/コーチの一覧です。</p>
      </div>

      <CalendarEventParticipantsTable data={participants} totalCount={totalCount} />
    </div>
  );
}
