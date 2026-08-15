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
import { ChevronLeft, ChevronRight, Loader2, CalendarClock, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getMySessions } from '@/actions/sessionAction';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { SessionListItem, SESSION_STATUS } from '@gabby/types/session';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { SessionActionDialog, SessionActionTarget } from './SessionActionDialog';

function formatTimeInZone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(iso));
}

export function CalendarBoard() {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => toIsoDateInZone(new Date(), timezone));
  const [actionTarget, setActionTarget] = useState<SessionActionTarget | null>(null);

  const loadMonth = useCallback(async () => {
    setIsLoading(true);
    try {
      const rangeStart = startOfMonth(currentMonth);
      const rangeEnd = endOfMonth(currentMonth);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
      const data = await getMySessions(rangeStart.toISOString(), rangeEnd.toISOString());
      setSessions(data);
    } finally {
      setIsLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionListItem[]>();
    for (const s of sessions) {
      const key = toIsoDateInZone(s.start_datetime, timezone);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [sessions, timezone]);

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

  const selectedSessions = (sessionsByDate.get(selectedDate) ?? []).slice().sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm font-black text-slate-800">{format(currentMonth, 'MMMM yyyy')}</p>
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400 uppercase mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const daySessions = sessionsByDate.get(key) ?? [];
            const isSelected = key === selectedDate;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(key)}
                className={cn(
                  'aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors relative',
                  !isSameMonth(day, currentMonth) && 'text-slate-300',
                  isSameMonth(day, currentMonth) && 'text-slate-700',
                  isSelected ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100',
                  isToday(day) && !isSelected && 'ring-1 ring-indigo-400'
                )}
              >
                {day.getDate()}
                {daySessions.length > 0 && (
                  <span className="flex gap-0.5">
                    {daySessions.slice(0, 3).map((s) => (
                      <span
                        key={s.session_id}
                        className={cn('w-1 h-1 rounded-full', isSelected ? 'bg-white' : SESSION_STATUS_BADGE[s.status].dotClassName)}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-black text-indigo-500 uppercase tracking-widest px-1">{selectedDate}</h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : selectedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center bg-white rounded-2xl border border-slate-200">
            <CalendarClock size={20} className="text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-500">No sessions on this day</p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedSessions.map((session) => {
              const badge = SESSION_STATUS_BADGE[session.status];
              const isFuture = new Date(session.start_datetime) > new Date();
              const canAct = session.status === SESSION_STATUS.SCHEDULED && isFuture;
              return (
                <article key={session.session_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-800">
                        {formatTimeInZone(session.start_datetime, timezone)} - {formatTimeInZone(session.end_datetime, timezone)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{session.counterpart_name}</p>
                    </div>
                    <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0', badge.className)}>
                      {badge.label}
                    </span>
                  </div>

                  {session.cancel_reason && (
                    <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{session.cancel_reason}</p>
                  )}

                  {canAct && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => setActionTarget({ session, mode: 'reschedule' })}>
                        <RotateCcw size={13} />
                        Reschedule
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-rose-600 border-rose-200 hover:bg-rose-50"
                        onClick={() => setActionTarget({ session, mode: 'cancel' })}
                      >
                        <X size={13} />
                        Cancel
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <SessionActionDialog target={actionTarget} onClose={() => setActionTarget(null)} onResolved={handleResolved} />
    </div>
  );
}
