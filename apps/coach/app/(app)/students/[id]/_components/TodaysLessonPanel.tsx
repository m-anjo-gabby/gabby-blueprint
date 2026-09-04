'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Loader2, MessageCircle, Video, Zap } from 'lucide-react';
import { SESSION_STATUS } from '@gabby/types/session';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { hasCoachJoinedSessions } from '@/actions/sessionAction';
import { useEndLesson } from '@/hooks/useEndLesson';
import { EndLessonReasonDialog } from '@/components/session/EndLessonReasonDialog';
import type { StudentSessionHistoryItem } from '@gabby/types/coachStudent';
import type { LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';

interface Props {
  studentId: string;
  sessions: StudentSessionHistoryItem[];
  /**
   * 次に実施可能な(status=scheduled かつ終了予定時刻が未来の)セッション。存在しなければnull。
   * 「Start Live Session」「End Lesson」の対象を決める、サーバー側の専用クエリ（getStudentUpcomingSession）の
   * 結果をそのまま使う。sessionsは履歴表示用に降順50件に絞られており、契約が長く将来分の
   * セッションが多く事前生成されている場合は直近のセッションが含まれないことがあるため、
   * ルーム誘導（＝どのsession_idに入室するか）の判定には使わない
   * （生徒側と異なるsession_idを選んでしまうと、別々の部屋に入室してしまいレッスンを開始できなくなる）。
   */
  upcomingSession: StudentSessionHistoryItem | null;
  lessonSprints: LessonSprintHistoryListItem[];
}

export function TodaysLessonPanel({ studentId, sessions, upcomingSession, lessonSprints }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [hasCoachJoined, setHasCoachJoined] = useState(false);
  const { endLesson, endingSessionId, reasonDialogOpen, closeReasonDialog, submitReason } = useEndLesson();

  const targetSession = upcomingSession;
  const lastCompletedSession = sessions.find((session) => session.status === SESSION_STATUS.COMPLETED);
  const lastSprint = lessonSprints[0];
  const targetSessionId = targetSession?.session_id;

  useEffect(() => {
    // targetSessionIdが無い間はEnd Lessonボタン自体が描画されないため、hasCoachJoinedのリセットは不要
    if (!targetSessionId) return;
    let cancelled = false;
    hasCoachJoinedSessions([targetSessionId]).then((presence) => {
      if (!cancelled) setHasCoachJoined(!!presence[targetSessionId]);
    });
    return () => {
      cancelled = true;
    };
  }, [targetSessionId]);

  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div className="space-y-1.5">
        <h2 className="text-sm font-bold text-indigo-700">Today&apos;s Lesson</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
          <span>
            Next session:{' '}
            <span className="text-slate-700">
              {targetSession ? formatDateTimeByZone(targetSession.start_datetime, timezone, false) : 'Not scheduled'}
            </span>
          </span>
          <span>
            Last live session:{' '}
            <span className="text-slate-700">
              {lastCompletedSession ? formatDateTimeByZone(lastCompletedSession.start_datetime, timezone, false) : '—'}
            </span>
          </span>
          <span>
            Last sprint:{' '}
            <span className="text-slate-700">
              {lastSprint ? formatDateTimeByZone(lastSprint.insert_date, timezone, false) : '—'}
            </span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {targetSession && (
          <>
            <Link
              href={`/students/${studentId}/room/${targetSession.session_id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Opens in a new tab, so you can keep sprint and material screens open alongside the call"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors px-4 py-2.5 rounded-full shadow-md shadow-indigo-200"
            >
              <Video size={14} />
              Start Live Session
              <ExternalLink size={12} className="opacity-70" />
            </Link>
            <button
              onClick={() => endLesson(targetSession.session_id, studentId)}
              disabled={!hasCoachJoined || endingSessionId === targetSession.session_id}
              title={hasCoachJoined ? 'Record this lesson’s outcome' : 'Join the call at least once before ending the lesson'}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors px-4 py-2.5 rounded-full shadow-sm"
            >
              {endingSessionId === targetSession.session_id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              End Lesson
            </button>
          </>
        )}
        <Link
          href={`/students/${studentId}/lesson-sprint`}
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
      </div>
      <EndLessonReasonDialog open={reasonDialogOpen} onClose={closeReasonDialog} onSubmit={submitReason} />
    </div>
  );
}
