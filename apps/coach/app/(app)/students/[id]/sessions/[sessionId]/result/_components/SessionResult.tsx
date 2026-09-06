'use client';

import Link from 'next/link';
import { ArrowLeft, LogIn, LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import type { SessionResultSummary } from '@gabby/types/session';
import type { SessionHomeworkEntry } from '@gabby/types/sessionHomework';
import { HomeworkComposer } from './HomeworkComposer';

interface Props {
  studentId: string;
  session: SessionResultSummary;
  homework: SessionHomeworkEntry[];
}

export function SessionResult({ studentId, session, homework }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const badge = SESSION_STATUS_BADGE[session.status];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 lg:h-full lg:min-h-0">
      <div className="lg:overflow-y-auto lg:min-h-0 space-y-4">
        <Link
          href={`/students/${studentId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
        <h1 className="text-lg font-black text-slate-900">Lesson Result</h1>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-800">Summary</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 space-y-3">
            <span className={`inline-flex text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${badge.className}`}>
              {badge.label}
            </span>
            <p className="text-xs font-semibold text-slate-600">
              {formatDateTimeByZone(session.start_datetime, timezone, false)} – {formatDateTimeByZone(session.end_datetime, timezone, false)}
            </p>
            <p className="text-xs font-semibold text-slate-400">with {session.counterpart_name}</p>
            {session.status_note && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Note</p>
                <p className="text-xs text-slate-600 whitespace-pre-wrap">{session.status_note}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-800">Join / Leave Timeline</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {session.call_log.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No call activity was recorded for this session.</p>
            ) : (
              <ul className="space-y-2">
                {session.call_log.map((entry) => (
                  <li key={entry.call_log_id} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${entry.role === 'coach' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                      {entry.left_at ? <LogOut size={11} /> : <LogIn size={11} />}
                    </span>
                    <span className="text-slate-600">
                      <span className="font-bold capitalize">{entry.role}</span>{' '}
                      joined {formatDateTimeByZone(entry.joined_at, timezone, false)}
                      {entry.left_at ? <> · left {formatDateTimeByZone(entry.left_at, timezone, false)}</> : <> · still connected</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-800">In-call Chat History</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {session.chat_log.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No chat messages were sent during this call.</p>
            ) : (
              <ul className="space-y-2">
                {session.chat_log.map((entry) => (
                  <li key={entry.chat_id} className={`text-xs ${entry.sender_role === 'coach' ? 'text-right' : 'text-left'}`}>
                    <p className="font-bold text-slate-400 text-[10px] capitalize">{entry.sender_role}</p>
                    <p
                      className={`inline-block mt-0.5 px-2.5 py-1.5 rounded-lg whitespace-pre-wrap wrap-break-word ${
                        entry.sender_role === 'coach' ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {entry.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="lg:overflow-y-auto lg:min-h-0">
        <HomeworkComposer sessionId={session.session_id} initialEntries={homework} />
      </div>
    </div>
  );
}
