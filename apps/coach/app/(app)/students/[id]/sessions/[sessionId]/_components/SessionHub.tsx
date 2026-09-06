'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
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
import type { LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';
import type { SelfTrainingWeekSummary } from '@gabby/types/coachStudent';

interface Props {
  studentId: string;
  session: SessionResultSummary;
  /** 直近の宿題（このセッション自身の投稿を除く。「前回の宿題」を通話前に振り返るためのもの） */
  recentHomework: SessionHomeworkEntry[];
  /** 直近のLesson Sprint実施（このセッション自身の実施分を除く） */
  recentSprints: LessonSprintHistoryListItem[];
  selfTrainingSummary: SelfTrainingWeekSummary;
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">{label}</h2>
      {children}
    </section>
  );
}

/**
 * セッション準備/実施ハブ。生徒概要画面から通話開始・Lesson Sprint開始・レッスン終了を
 * 直接行う導線を廃止し、個別レッスンセッション単位でここに集約する。ビデオ通話自体は
 * 画面共有等でLesson Sprint/教材画面と並行利用できるよう引き続き別タブで開く。
 *
 * このセッション自身の実施記録（入退室ログ・チャット履歴・スプリント履歴）はレッスン結果画面
 * （.../result）で確認する前提とし、ここでは重複させない。代わりに、通話前後に画面遷移せず
 * 確認したい「前回までの状況」（前回の宿題・前回のLesson Sprint・直近の自主トレ状況）を
 * 要点だけ凝縮して表示する（コーチへのヒアリングで「準備のためになるべく画面遷移せず生徒の
 * 情報を見たい」という要望があったため）。
 */
export function SessionHub({ studentId, session, recentHomework, recentSprints, selfTrainingSummary }: Props) {
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
    <div className="max-w-5xl mx-auto space-y-8 pb-8">
      <div>
        <Link
          href={`/students/${studentId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-slate-800">Session Hub</CardTitle>
        </CardHeader>
        <CardContent className="pt-2 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${badge.className}`}>
              {badge.label}
            </span>
            {isActionable && hasCoachJoined && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                <BadgeCheck size={11} />
                You joined this call
              </span>
            )}
          </div>
          <p className="text-xs font-semibold text-slate-600">
            {formatDateTimeByZone(session.start_datetime, timezone, false)} – {formatDateTimeByZone(session.end_datetime, timezone, false)}
          </p>
          <p className="text-xs font-semibold text-slate-400">with {session.counterpart_name}</p>

          {isActionable ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
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
                View Session Result
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Section label="Prep">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">Last Lesson Sprint</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {recentSprints.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No previous Lesson Sprint on record.</p>
              ) : (
                <ul className="space-y-2">
                  {recentSprints.map((entry) => (
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
              <CardTitle className="text-sm font-bold text-slate-800">Last Homework</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {recentHomework.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No homework posted yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recentHomework.map((entry) => (
                    <li key={entry.homework_id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                      <p className="text-[10px] font-bold text-slate-400">{formatDateTimeByZone(entry.insert_date, timezone, false)}</p>
                      {entry.homework_text && (
                        <p className="text-xs text-slate-700 mt-0.5 line-clamp-2 whitespace-pre-wrap wrap-break-word">{entry.homework_text}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section label="Self-Training">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-800">Last {selfTrainingSummary.days} Days</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {selfTrainingSummary.total_questions === 0 ? (
              <p className="text-xs text-slate-400 italic">No self-training activity in the last {selfTrainingSummary.days} days.</p>
            ) : (
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xl font-black text-slate-800">{selfTrainingSummary.active_days}<span className="text-xs font-semibold text-slate-400">/{selfTrainingSummary.days} days</span></p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active</p>
                </div>
                <div>
                  <p className="text-xl font-black text-slate-800">{selfTrainingSummary.total_questions}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Questions</p>
                </div>
                <div>
                  <p className="text-xl font-black text-slate-800">{selfTrainingSummary.total_assessments}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Speaking Assessments</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </Section>

      <EndLessonReasonDialog open={reasonDialogOpen} onClose={closeReasonDialog} onSubmit={submitReason} />
    </div>
  );
}
