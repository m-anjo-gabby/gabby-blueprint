'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { DAY_OF_WEEK_SHORT_LABEL_EN } from '@/constants/availability';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import type { DayOfWeek } from '@gabby/types/coachAvailability';
import { SESSION_STATUS, SessionListItem } from '@gabby/types/session';
import type { LiveSessionShortfallItem, StudentSessionHistoryItem } from '@gabby/types/coachStudent';
import { SessionActionDialog, SessionActionTarget } from '../../../calendar/_components/SessionActionDialog';
import { BookMakeupSessionDialog } from './BookMakeupSessionDialog';

interface Props {
  studentId: string;
  studentName: string;
  sessions: StudentSessionHistoryItem[];
  shortfalls: LiveSessionShortfallItem[];
}

function toSessionListItem(session: StudentSessionHistoryItem, studentId: string, studentName: string): SessionListItem {
  return {
    session_id: session.session_id,
    schedule_id: session.schedule_id,
    start_datetime: session.start_datetime,
    end_datetime: session.end_datetime,
    status: session.status,
    viewer_role: 'coach',
    counterpart_id: studentId,
    counterpart_name: studentName,
    rescheduled_from: session.rescheduled_from,
    cancel_reason: session.cancel_reason,
    status_note: session.status_note,
  };
}

export function LiveSessionHistoryCard({ studentId, studentName, sessions: initialSessions, shortfalls }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions);
  const [actionTarget, setActionTarget] = useState<SessionActionTarget | null>(null);
  const [bookMakeupScheduleId, setBookMakeupScheduleId] = useState<string | null>(null);

  const handleResolved = (sessionId: string, patch: Partial<SessionListItem>) => {
    setSessions((prev) => prev.map((s) => (s.session_id === sessionId ? { ...s, ...patch } : s)));
    // キャンセルの返還可否・振替による新規行の追加はこのカードの外(shortfalls)にも影響するため、
    // サーバーの最新データで再取得する
    router.refresh();
  };

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
            <ul className="space-y-1.5 pl-5.5">
              {shortfalls.map((s) => (
                <li key={s.schedule_id} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-amber-700">
                    {DAY_OF_WEEK_SHORT_LABEL_EN[s.day_of_week as DayOfWeek]} {s.start_time.slice(0, 5)}: only {s.actual_sessions} of {s.expected_sessions} sessions scheduled ({s.shortfall} short).
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-amber-700 border-amber-200 hover:bg-amber-100"
                    onClick={() => setBookMakeupScheduleId(s.schedule_id)}
                  >
                    Book
                  </Button>
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
              const isFuture = new Date(session.start_datetime) > new Date();
              const canAct = session.status === SESSION_STATUS.SCHEDULED && isFuture;
              return (
                <li
                  key={session.session_id}
                  className="flex flex-col gap-2 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-700">
                      {formatDateTimeByZone(session.start_datetime, timezone, false)}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  {canAct && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setActionTarget({ session: toSessionListItem(session, studentId, studentName), mode: 'reschedule' })}
                      >
                        <RotateCcw size={13} />
                        Reschedule
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-rose-600 border-rose-200 hover:bg-rose-50"
                        onClick={() => setActionTarget({ session: toSessionListItem(session, studentId, studentName), mode: 'cancel' })}
                      >
                        <X size={13} />
                        Cancel
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <SessionActionDialog target={actionTarget} onClose={() => setActionTarget(null)} onResolved={handleResolved} />

      <BookMakeupSessionDialog
        scheduleId={bookMakeupScheduleId}
        onClose={() => setBookMakeupScheduleId(null)}
        onBooked={() => {
          setBookMakeupScheduleId(null);
          router.refresh();
        }}
      />
    </Card>
  );
}
