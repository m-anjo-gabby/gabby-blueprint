'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMySessions } from '@/actions/sessionAction';
import { getMyCalendarEvents } from '@/actions/calendarEventAction';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { SessionListItem, SESSION_STATUS } from '@gabby/types/session';
import { CalendarEventItem, CALENDAR_EVENT_TYPES } from '@gabby/types/calendarEvent';
import { CalendarItem, getCalendarItemKey } from '@gabby/types/calendarItem';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { SessionActionDialog, SessionActionTarget } from './SessionActionDialog';
import { DayDetailDrawer } from './DayDetailDrawer';

const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const MAX_VISIBLE_CHIPS = 2;

function getChipInfo(item: CalendarItem): { label: string; className: string } {
  if (item.kind === 'session') {
    return { label: item.data.counterpart_name, className: SESSION_STATUS_BADGE[item.data.status].className };
  }
  return { label: item.data.title, className: CALENDAR_EVENT_TYPES[item.data.event_type].badgeClass };
}

export function CalendarBoard() {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<SessionActionTarget | null>(null);

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
      setSessions(sessionData);
      setEvents(eventData);
    } finally {
      setIsLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

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

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const handleResolved = (sessionId: string, patch: Partial<SessionListItem>) => {
    setSessions((prev) => prev.map((s) => (s.session_id === sessionId ? { ...s, ...patch } : s)));
    // 振替は新しいセッション行が生成されるため、正確な反映のため月データを再取得する
    if (patch.status === SESSION_STATUS.RESCHEDULED) {
      loadMonth();
    }
  };

  const handleParticipationChanged = (calendarEventId: string, isJoined: boolean) => {
    setEvents((prev) => prev.map((e) => (e.calendar_event_id === calendarEventId ? { ...e, is_joined: isJoined } : e)));
  };

  const selectedItems = selectedDate ? itemsByDate.get(selectedDate) ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="前の月"
          >
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm font-black text-slate-800">{format(currentMonth, 'yyyy年M月')}</p>
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="次の月"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400 mb-1">
          {WEEKDAY_LABELS_JA.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayItems = itemsByDate.get(key) ?? [];
              const isSelected = key === selectedDate;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={cn(
                    'min-h-16 sm:min-h-19 rounded-lg flex flex-col items-stretch p-1 gap-0.5 text-left transition-colors relative',
                    !isSameMonth(day, currentMonth) && 'opacity-40',
                    isSelected ? 'bg-indigo-50 ring-2 ring-indigo-500' : 'hover:bg-slate-100',
                    isToday(day) && !isSelected && 'ring-1 ring-indigo-300'
                  )}
                >
                  <span className={cn('text-[11px] font-bold px-0.5 text-center', isSameMonth(day, currentMonth) ? 'text-slate-700' : 'text-slate-400')}>
                    {day.getDate()}
                  </span>
                  <div className="space-y-0.5 min-w-0">
                    {dayItems.slice(0, MAX_VISIBLE_CHIPS).map((item) => {
                      const chip = getChipInfo(item);
                      return (
                        <span
                          key={getCalendarItemKey(item)}
                          className={cn('block text-[8px] font-bold px-1 py-0.5 rounded border truncate leading-tight', chip.className)}
                        >
                          {chip.label}
                        </span>
                      );
                    })}
                    {dayItems.length > MAX_VISIBLE_CHIPS && (
                      <span className="block text-[8px] font-bold text-slate-400 px-1">他{dayItems.length - MAX_VISIBLE_CHIPS}件</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <DayDetailDrawer
        date={selectedDate}
        items={selectedItems}
        timezone={timezone}
        onClose={() => setSelectedDate(null)}
        onActionRequested={setActionTarget}
        onParticipationChanged={handleParticipationChanged}
      />

      <SessionActionDialog target={actionTarget} onClose={() => setActionTarget(null)} onResolved={handleResolved} />
    </div>
  );
}
