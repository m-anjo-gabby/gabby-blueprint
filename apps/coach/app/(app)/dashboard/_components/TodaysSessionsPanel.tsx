'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getMySessions } from '@/actions/sessionAction';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { SessionListItem, SESSION_STATUS } from '@gabby/types/session';

function formatTimeRange(startIso: string, endIso: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
  return `${fmt.format(new Date(startIso))} – ${fmt.format(new Date(endIso))}`;
}

export default function TodaysSessionsPanel() {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const now = new Date();
      const rangeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const rangeEnd = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const data = await getMySessions(rangeStart.toISOString(), rangeEnd.toISOString());
      if (!cancelled) {
        setSessions(data);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timezone]);

  const todaysSessions = useMemo(() => {
    const todayKey = toIsoDateInZone(new Date(), timezone);
    return sessions
      .filter((s) => s.status === SESSION_STATUS.SCHEDULED && toIsoDateInZone(s.start_datetime, timezone) === todayKey)
      .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
  }, [sessions, timezone]);

  const nextSessionId = todaysSessions[0]?.session_id;

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold text-slate-800">Today&apos;s Sessions</CardTitle>
        <Link href="/calendar" className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
          View calendar
        </Link>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-14 w-full rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : todaysSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CalendarCheck size={22} className="text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-400">No sessions scheduled today</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {todaysSessions.map((session) => (
              <li key={session.session_id}>
                <Link
                  href={`/students/${session.counterpart_id}/sessions/${session.session_id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-200 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-slate-700 truncate">{session.counterpart_name}</p>
                      {session.session_id === nextSessionId && (
                        <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-wider border border-indigo-100 shrink-0">
                          Up next
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {formatTimeRange(session.start_datetime, session.end_datetime, timezone)}
                    </p>
                  </div>
                  <ArrowRight size={14} className="text-slate-300 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
