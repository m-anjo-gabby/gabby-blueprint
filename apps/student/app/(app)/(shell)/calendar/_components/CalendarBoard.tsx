'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { useMonthNavigator } from '@gabby/lib/hooks/useMonthNavigator';
import { useServerSyncedState } from '@gabby/lib/hooks/useServerSyncedState';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { SessionListItem } from '@gabby/types/session';
import { CalendarEventItem } from '@gabby/types/calendarEvent';
import type { CalendarItem } from '@gabby/types/calendarItem';
import { BookableTicketSlot } from '@gabby/types/matching';
import { SessionActionDialog, SessionActionTarget } from './SessionActionDialog';
import { DayDetailDrawer } from './DayDetailDrawer';
import { BookMakeupSessionDialog } from './BookMakeupSessionDialog';
import { CalendarMonthCard } from './CalendarMonthCard';

const EMPTY_SESSIONS: SessionListItem[] = [];
const EMPTY_EVENTS: CalendarEventItem[] = [];
const EMPTY_SLOTS: BookableTicketSlot[] = [];

interface CalendarBoardProps {
  /** 表示する月（YYYY-MM）。URL の ?month= で持ち、月の切り替えはページ遷移で行う */
  month: string;
  /** サーバーで取得した月のセッション・イベント。null は読み込み中（日付の枠だけを描き、予定は出さない） */
  initialSessions: SessionListItem[] | null;
  initialEvents: CalendarEventItem[] | null;
  /** 振替の予約リクエストができるチケットの枠（読み込み中は null） */
  bookableSlots: BookableTicketSlot[] | null;
}

/**
 * 月表示のカレンダーと、日付の詳細・キャンセル・振替リクエストの操作。
 * 月のデータはサーバーで取得して渡す（ブラウザからの後追い取得はしない）。読み込み中も同じ大きさの日付の枠を描き、
 * 月の切り替えで高さが変わらないようにする（page.tsx で月ごとの Suspense の fallback と、loading.tsx で共有する）。
 */
export function CalendarBoard({ month, initialSessions, initialEvents, bookableSlots: serverSlots }: CalendarBoardProps) {
  const timezone = useTimezone();
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const isLoading = initialSessions === null || initialEvents === null;
  const [year, monthNo] = month.split('-').map(Number);
  const currentMonth = new Date(year, monthNo - 1, 1);
  const monthNavigator = useMonthNavigator({ targetMonth: month, basePath: '/calendar' });
  // 画面内の操作（キャンセル・参加表明）は即時に反映し、サーバーから新しいデータが届いたら置き換える
  const [sessions, setSessions] = useServerSyncedState(initialSessions ?? EMPTY_SESSIONS);
  const [events, setEvents] = useServerSyncedState(initialEvents ?? EMPTY_EVENTS);
  const bookableSlots = serverSlots ?? EMPTY_SLOTS;
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<SessionActionTarget | null>(null);
  const [bookMakeupDate, setBookMakeupDate] = useState<string | null>(null);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const s of sessions) {
      const key = toIsoDateInZone(s.start_datetime, timezone);
      const list = map.get(key) ?? [];
      list.push({ kind: 'session', date: key, data: s });
      map.set(key, list);
    }
    for (const e of events) {
      const key = toIsoDateInZone(e.start_datetime, timezone);
      const list = map.get(key) ?? [];
      list.push({ kind: 'calendar_event', date: key, data: e });
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.data.start_datetime.localeCompare(b.data.start_datetime));
    }
    return map;
  }, [sessions, events, timezone]);

  const handleResolved = (sessionId: string, patch: Partial<SessionListItem>) => {
    setSessions((prev) => prev.map((s) => (s.session_id === sessionId ? { ...s, ...patch } : s)));
  };

  const handleParticipationChanged = (calendarEventId: string, isJoined: boolean) => {
    setEvents((prev) => prev.map((e) => (e.calendar_event_id === calendarEventId ? { ...e, is_joined: isJoined } : e)));
  };

  const selectedItems = selectedDate ? itemsByDate.get(selectedDate) ?? [] : [];

  return (
    <div className="space-y-6">
      <CalendarMonthCard
        currentMonth={currentMonth}
        itemsByDate={isLoading ? null : itemsByDate}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onPrev={() => monthNavigator.handleMonthChange('prev')}
        onNext={() => monthNavigator.handleMonthChange('next')}
        isPending={monthNavigator.isPending}
      />

      <DayDetailDrawer
        date={selectedDate}
        items={selectedItems}
        timezone={timezone}
        hasBookableTickets={bookableSlots.length > 0}
        onClose={() => setSelectedDate(null)}
        onActionRequested={setActionTarget}
        onParticipationChanged={handleParticipationChanged}
        onBookMakeupRequested={setBookMakeupDate}
      />

      <SessionActionDialog target={actionTarget} onClose={() => setActionTarget(null)} onResolved={handleResolved} />

      <BookMakeupSessionDialog
        open={!!bookMakeupDate}
        slots={bookableSlots}
        initialDate={bookMakeupDate}
        onClose={() => setBookMakeupDate(null)}
        // リクエスト後はサーバーで月のデータ・予約できる枠を取り直す
        onRequested={() => startRefresh(() => router.refresh())}
      />
    </div>
  );
}
