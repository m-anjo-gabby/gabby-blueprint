'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LogIn,
  LogOut,
  Loader2,
  MessageCircle,
  Video,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { hasCoachJoinedSessions } from '@/actions/sessionAction';
import { useEndLesson } from '@/hooks/useEndLesson';
import { EndLessonReasonDialog } from '@/components/session/EndLessonReasonDialog';
import { SESSION_STATUS, type SessionResultSummary } from '@gabby/types/session';
import type { SessionHomeworkEntry } from '@gabby/types/sessionHomework';

interface Props {
  studentId: string;
  session: SessionResultSummary;
  homework: SessionHomeworkEntry[];
}

/**
 * セッション準備/実施ハブ。生徒概要画面から通話開始・Lesson Sprint開始・レッスン終了を
 * 直接行う導線を廃止し、個別レッスンセッション単位でここに集約する。ビデオ通話自体は
 * 画面共有等でLesson Sprint/教材画面と並行利用できるよう引き続き別タブで開く。
 */
export function SessionHub({ studentId, session, homework }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const badge = SESSION_STATUS_BADGE[session.status];
  const isActionable = session.status === SESSION_STATUS.SCHEDULED;

  const [hasCoachJoined, setHasCoachJoined] = useState(false);
  const { endLesson, endingSessionId, reasonDialogOpen, closeReasonDialog, submitReason } = useEndLesson();

  useEffect(() => {
    if (!isActionable) return;
    let cancelled = false;
    hasCoachJoinedSessions([session.session_id]).then((presence) => {
      if (!cancelled) setHasCoachJoined(!!presence[session.session_id]);
    });
    return () => {
      cancelled = true;
    };
  }, [isActionable, session.session_id]);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link
        href={`/students/${studentId}`}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Overview
      </Link>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-slate-800">Session Hub</CardTitle>
        </CardHeader>
        <CardContent className="pt-2 space-y-4">
          <div className="space-y-2">
            <span className={`inline-flex text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${badge.className}`}>
              {badge.label}
            </span>
            <p className="text-xs font-semibold text-slate-600">
              {formatDateTimeByZone(session.start_datetime, timezone, false)} – {formatDateTimeByZone(session.end_datetime, timezone, false)}
            </p>
            <p className="text-xs font-semibold text-slate-400">with {session.counterpart_name}</p>
          </div>

          {isActionable ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/students/${studentId}/room/${session.session_id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Opens in a new tab, so you can keep sprint and material screens open alongside the call"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors px-4 py-2.5 rounded-full shadow-md shadow-indigo-200"
              >
                <Video size={14} />
                Start Live Session
                <ExternalLink size={12} className="opacity-70" />
              </Link>
              <Link
                href={`/students/${studentId}/lesson-sprint?session_id=${session.session_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors px-4 py-2.5 rounded-full shadow-sm"
              >
                <Zap size={14} className="fill-current text-amber-300" />
                Start Lesson Sprint
              </Link>
              <span
                title="Dialog practice is coming soon"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-white/70 border border-slate-200 px-4 py-2.5 rounded-full cursor-not-allowed"
              >
                <MessageCircle size={14} />
                Dialog Practice
                <span className="text-[9px] font-black uppercase tracking-wide">Soon</span>
              </span>
              <button
                onClick={() => endLesson(session.session_id, studentId)}
                disabled={!hasCoachJoined || endingSessionId === session.session_id}
                title={hasCoachJoined ? 'Record this session’s outcome' : 'Join the call at least once before ending the session'}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors px-4 py-2.5 rounded-full shadow-sm"
              >
                {endingSessionId === session.session_id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                End Session
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
              <p className="text-xs text-slate-500">This lesson has already been finalized.</p>
              <Link
                href={`/students/${studentId}/sessions/${session.session_id}/result`}
                className="shrink-0 text-xs font-bold text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                View Lesson Result
              </Link>
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
            <p className="text-xs text-slate-400 italic">No call activity has been recorded yet.</p>
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
          <CardTitle className="text-sm font-bold text-slate-800">Lesson Sprint History</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {session.sprint_log.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No Lesson Sprint has been run in this session yet.</p>
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

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-slate-800">In-call Chat History</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {session.chat_log.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No chat messages have been sent yet.</p>
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

      {homework.length > 0 && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-800">Homework</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 space-y-3">
            {homework.map((entry) => (
              <div key={entry.homework_id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 space-y-1">
                <p className="text-[10px] font-bold text-slate-400">{formatDateTimeByZone(entry.insert_date, timezone, false)}</p>
                {entry.homework_text && (
                  <p className="text-xs text-slate-700 whitespace-pre-wrap wrap-break-word">{entry.homework_text}</p>
                )}
              </div>
            ))}
            <Link
              href={`/students/${studentId}/sessions/${session.session_id}/result`}
              className="inline-block text-[11px] font-bold text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              View / post homework on the lesson result page →
            </Link>
          </CardContent>
        </Card>
      )}

      <EndLessonReasonDialog open={reasonDialogOpen} onClose={closeReasonDialog} onSubmit={submitReason} />
    </div>
  );
}
