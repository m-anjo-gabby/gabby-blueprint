'use client';

import { CalendarClock, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { DAY_OF_WEEK_SHORT_LABEL_EN } from '@/constants/availability';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import type { DayOfWeek } from '@gabby/types/coachAvailability';
import type { LiveSessionShortfallItem, StudentSessionHistoryItem } from '@gabby/types/coachStudent';

interface Props {
  sessions: StudentSessionHistoryItem[];
  shortfalls: LiveSessionShortfallItem[];
}

export function LiveSessionHistoryCard({ sessions, shortfalls }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-800">Live Sessions</CardTitle>
      </CardHeader>
      <CardContent className="pt-2 space-y-3">
        {shortfalls.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
              <TriangleAlert size={14} className="shrink-0" />
              Not all contracted sessions could be scheduled
            </div>
            <ul className="space-y-0.5 pl-5.5">
              {shortfalls.map((s) => (
                <li key={s.schedule_id} className="text-[11px] font-semibold text-amber-700">
                  {DAY_OF_WEEK_SHORT_LABEL_EN[s.day_of_week as DayOfWeek]} {s.start_time.slice(0, 5)}: only {s.actual_sessions} of {s.expected_sessions} sessions scheduled ({s.shortfall} short). Please book the remaining session{s.shortfall > 1 ? 's' : ''} separately.
                </li>
              ))}
            </ul>
          </div>
        )}
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CalendarClock size={22} className="text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-400">No sessions yet</p>
          </div>
        ) : (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {sessions.map((session) => {
              const badge = SESSION_STATUS_BADGE[session.status];
              return (
                <li
                  key={session.session_id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60"
                >
                  <span className="text-xs font-semibold text-slate-700">
                    {formatDateTimeByZone(session.start_datetime, timezone, false)}
                  </span>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 ${badge.className}`}>
                    {badge.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
