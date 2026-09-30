'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { getMySessions } from '@/actions/sessionAction';
import { getMyCalendarEvents } from '@/actions/calendarEventAction';
import { getMyBookableTickets } from '@/actions/matchingAction';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { SessionListItem, SESSION_NON_ACTIONABLE_STATUSES } from '@gabby/types/session';
import { CalendarEventItem } from '@gabby/types/calendarEvent';
import type { CalendarItem } from '@gabby/types/calendarItem';
import { BookableTicketSlot } from '@gabby/types/matching';
import { SessionActionDialog, SessionActionTarget } from './SessionActionDialog';
import { DayDetailDrawer } from './DayDetailDrawer';
import { BookMakeupSessionDialog } from './BookMakeupSessionDialog';
import { CalendarMonthCard } from './CalendarMonthCard';

export function CalendarBoard() {
  const timezone = useTimezone();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<SessionActionTarget | null>(null);
  const [bookableSlots, setBookableSlots] = useState<BookableTicketSlot[]>([]);
  const [bookMakeupDate, setBookMakeupDate] = useState<string | null>(null);

  const loadMonth = useCallback(async () => {
    setIsLoading(true);
    try {
      const rangeStart = startOfMonth(currentMonth);
      const rangeEnd = endOfMonth(currentMonth);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
      const [sessionData, eventData] = await Promise.all([
        getMySessions(rangeStart.toISOString(), rangeEnd.toISOString()),
        getMyCalendarEvents(rangeStart.toISOString(), rangeEnd.toISOString()),
      ]);
      // キャンセル済み・振替元・ライセンス無効化による自動キャンセルはカレンダーに出さない
      // （振替後の新しいコマや、別の生徒の予約が同じ枠に入るケースがありノイズになるため）
      setSessions(sessionData.filter((s) => !SESSION_NON_ACTIONABLE_STATUSES.includes(s.status)));
      setEvents(eventData);
    } finally {
      setIsLoading(false);
    }
  }, [currentMonth]);

  const loadBookableSlots = useCallback(async () => {
    setBookableSlots(await getMyBookableTickets());
  }, []);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    loadBookableSlots();
  }, [loadBookableSlots]);

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
        onPrev={() => setCurrentMonth((m) => subMonths(m, 1))}
        onNext={() => setCurrentMonth((m) => addMonths(m, 1))}
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
        onRequested={() => {
          loadMonth();
          loadBookableSlots();
        }}
      />
    </div>
  );
}
