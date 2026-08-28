'use client';

import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import type { StudentSessionHistoryItem } from '@gabby/types/coachStudent';

interface Props {
  sessions: StudentSessionHistoryItem[];
}

export function LiveSessionHistoryCard({ sessions }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-800">Live Sessions</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
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
