'use client';

import Link from 'next/link';
import { ArrowRight, SquareArrowOutUpRight } from 'lucide-react';
import { SESSION_STATUS } from '@gabby/types/session';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
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

  const targetSession = upcomingSession;
  const lastCompletedSession = sessions.find((session) => session.status === SESSION_STATUS.COMPLETED);
  const lastSprint = lessonSprints[0];

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
        {targetSession ? (
          <Link
            href={`/students/${studentId}/sessions/${targetSession.session_id}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors px-4 py-2.5 rounded-full shadow-md shadow-indigo-200"
          >
            Open Session
            <ArrowRight size={14} />
          </Link>
        ) : (
          <Link
            href={`/students/${studentId}/lesson-sprint`}
            title="No upcoming live session — start a standalone Lesson Sprint (e.g. run over an external call)"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors px-4 py-2.5 rounded-full shadow-sm"
          >
            Start Lesson Sprint
            <SquareArrowOutUpRight size={12} className="opacity-70" />
          </Link>
        )}
      </div>
    </div>
  );
}
