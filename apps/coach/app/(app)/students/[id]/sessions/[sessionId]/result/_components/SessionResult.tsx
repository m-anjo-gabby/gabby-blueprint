'use client';

import type { ReactNode } from 'react';
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

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">{label}</h2>
      {children}
    </section>
  );
}

export function SessionResult({ studentId, session, homework }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const badge = SESSION_STATUS_BADGE[session.status];

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-8">
      <div className="space-y-1">
        <Link
          href={`/students/${studentId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
        <h1 className="text-lg font-black text-slate-900">Session Result</h1>
      </div>

      <Section label="Summary">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">Session Info</CardTitle>
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
        </div>
      </Section>

      <Section label="Homework">
        <div className="max-w-2xl">
          <HomeworkComposer sessionId={session.session_id} initialEntries={homework} />
        </div>
      </Section>

      <Section label="Training">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">Lesson Sprint History</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {session.sprint_log.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No Lesson Sprint was run in this session.</p>
              ) : (
                <ul className="space-y-2">
                  {session.sprint_log.map((entry) => (
                    <li key={entry.lesson_sprint_id}>
                      <Link
                        href={`/students/${studentId}/lesson-sprint/result/${entry.lesson_sprint_id}`}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-200 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{entry.content_name}</p>
                          <p className="text-[11px] text-slate-400">{formatDateTimeByZone(entry.insert_date, timezone, false)}</p>
                        </div>
                        <span className="shrink-0 text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1">
                          {entry.average_score !== null ? `${entry.average_score}/5` : '—'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 border-dashed shadow-sm bg-slate-50/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-500 flex items-center gap-1.5">
                Dialog Practice History
                <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 bg-white border border-slate-200 rounded-full px-1.5 py-0.5">
                  Soon
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-xs text-slate-400 italic">Coming soon.</p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section label="Other">
        <div className="max-w-2xl">
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
      </Section>
    </div>
  );
}
