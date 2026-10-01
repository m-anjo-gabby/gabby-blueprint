import { getMySessions } from '@/actions/sessionAction';
import { getMyCalendarEvents } from '@/actions/calendarEventAction';
import { getMyBookableTickets } from '@/actions/matchingAction';
import { SESSION_NON_ACTIONABLE_STATUSES } from '@gabby/types/session';
import { getMonthGridRange } from '@gabby/lib/calendar/monthGridRange';
import { CalendarBoard } from './CalendarBoard';

/** 月のセッション・イベントと、振替の予約リクエストができる枠をサーバーで取得して、カレンダーを描く（page.tsx で月ごとの Suspense に包む） */
export async function CalendarMonthSection({ month }: { month: string }) {
  const { startIso, endIso } = getMonthGridRange(month);
  const [sessions, events, bookableSlots] = await Promise.all([
    getMySessions(startIso, endIso),
    getMyCalendarEvents(startIso, endIso),
    getMyBookableTickets(),
  ]);
  return (
    <CalendarBoard
      month={month}
      // キャンセル済み・振替元・ライセンス無効化による自動キャンセルはカレンダーに出さない
      // （振替後の新しいコマや、別の生徒の予約が同じ枠に入るケースがありノイズになるため）
      initialSessions={sessions.filter((s) => !SESSION_NON_ACTIONABLE_STATUSES.includes(s.status))}
      initialEvents={events}
      bookableSlots={bookableSlots}
    />
  );
}
