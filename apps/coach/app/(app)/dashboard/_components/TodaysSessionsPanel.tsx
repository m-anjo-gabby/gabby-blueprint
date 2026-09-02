'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, Video, ExternalLink } from 'lucide-react';
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
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">Today&apos;s Sessions</h2>
        <Link
          href="/calendar"
          className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          View calendar
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-16 w-full rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : todaysSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center bg-white rounded-2xl border border-slate-200">
          <CalendarCheck size={22} className="text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-500">No sessions scheduled today</p>
          <p className="text-[11px] text-slate-400 mt-1.5">Enjoy the break, or check your availability for upcoming bookings.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {todaysSessions.map((session) => (
            <div
              key={session.session_id}
              className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black text-slate-800 truncate">{session.counterpart_name}</p>
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

              <Link
                href={`/students/${session.counterpart_id}/room`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors px-3.5 py-2 rounded-full shadow-sm shrink-0"
              >
                <Video size={13} />
                Start
                <ExternalLink size={11} className="opacity-70" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
