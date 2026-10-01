'use client';

import Link from 'next/link';
import { ArrowLeft, BookOpen, Info, LogIn, LogOut, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Section } from '@/components/common/Section';
import { getSessionStatusBadge } from '@/constants/session';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import type { SessionResultSummary } from '@gabby/types/session';
import type { SessionHomeworkChecklistItem, SessionHomeworkEntry } from '@gabby/types/sessionHomework';
import { HomeworkComposer } from './HomeworkComposer';
import { LessonSprintHistoryRow } from '../../../../_components/LessonSprintHistoryRow';

interface Props {
  studentId: string;
  session: SessionResultSummary;
  homework: SessionHomeworkEntry | null;
  checklist: SessionHomeworkChecklistItem[];
}

export function SessionResult({ studentId, session, homework, checklist }: Props) {
  const timezone = useTimezone();
  const badge = getSessionStatusBadge(session);

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

      <Section label="Summary" icon={Info}>
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
                {formatDateTimeEn(session.start_datetime, timezone)} – {formatDateTimeEn(session.end_datetime, timezone)}
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
                      <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${entry.role === 'coach' ? 'bg-brand-50 text-brand' : 'bg-rose-50 text-rose-600'}`}>
                        {entry.left_at ? <LogOut size={11} /> : <LogIn size={11} />}
                      </span>
                      <span className="text-slate-600">
                        <span className="font-bold capitalize">{entry.role}</span>{' '}
                        joined {formatDateTimeEn(entry.joined_at, timezone)}
                        {entry.left_at ? <> · left {formatDateTimeEn(entry.left_at, timezone)}</> : <> · still connected</>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section label="Homework" icon={BookOpen}>
        <HomeworkComposer sessionId={session.session_id} initialHomework={homework} initialChecklist={checklist} />
      </Section>

      <Section label="Training">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">Live Sprint History</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {session.sprint_log.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No Live Sprint was run in this session.</p>
              ) : (
                <ul className="space-y-2">
                  {session.sprint_log.map((entry) => (
                    <li key={entry.lesson_sprint_id}>
                      <LessonSprintHistoryRow
                        studentId={studentId}
                        record={entry}
                        backHref={`/students/${studentId}/sessions/${session.session_id}/result`}
                        backLabel="Back to Session Result"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">Dialog Practice History</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {session.dialogue_log.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No Dialogue Practice material was opened in this session.</p>
              ) : (
                <ul className="space-y-2">
                  {session.dialogue_log.map((entry) => (
                    <li key={entry.log_id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                      <p className="text-[10px] font-bold text-slate-400">{formatDateTimeEn(entry.insert_date, timezone)}</p>
                      <p className="text-xs text-slate-700 font-semibold mt-0.5">
                        {entry.content_name} · Session {entry.session_no}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section label="Other" icon={MessageCircle}>
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
                        entry.sender_role === 'coach' ? 'bg-brand-50 text-brand-strong' : 'bg-rose-50 text-rose-700'
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
      </Section>
    </div>
  );
}
