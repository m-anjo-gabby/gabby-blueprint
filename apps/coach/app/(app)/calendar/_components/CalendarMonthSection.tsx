import { getMySessions } from '@/actions/sessionAction';
import { getMyCalendarEvents } from '@/actions/calendarEventAction';
import { SESSION_NON_ACTIONABLE_STATUSES } from '@gabby/types/session';
import { CalendarBoard } from './CalendarBoard';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 月表示のグリッド（前後の週を含む）を確実に覆う取得範囲。
 * 日付への振り分けはコーチのタイムゾーンで画面側が行うため、どのタイムゾーンでも欠けないよう前後に余裕を持たせる。
 */
function getMonthGridRange(month: string): { startIso: string; endIso: string } {
  const [year, monthNo] = month.split('-').map(Number);
  const start = Date.UTC(year, monthNo - 1, 1) - 8 * DAY_MS;
  const end = Date.UTC(year, monthNo, 1) + 8 * DAY_MS;
  return { startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() };
}

/** 月のセッション・イベントをサーバーで取得して、カレンダーを描く（page.tsx で月ごとの Suspense に包む） */
export async function CalendarMonthSection({ month }: { month: string }) {
  const { startIso, endIso } = getMonthGridRange(month);
  const [sessions, events] = await Promise.all([getMySessions(startIso, endIso), getMyCalendarEvents(startIso, endIso)]);
  return (
    <CalendarBoard
      month={month}
      // キャンセル済み・振替元・ライセンス無効化による自動キャンセルはカレンダーに出さない
      // （振替後の新しいコマや、別の生徒の予約が同じ枠に入るケースがありノイズになるため）
      initialSessions={sessions.filter((s) => !SESSION_NON_ACTIONABLE_STATUSES.includes(s.status))}
      initialEvents={events}
    />
  );
}
