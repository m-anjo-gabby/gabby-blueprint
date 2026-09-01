'use client';

import Link from 'next/link';
import { ExternalLink, MessageCircle, Video, Zap } from 'lucide-react';
import { SESSION_STATUS } from '@gabby/types/session';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import type { StudentSessionHistoryItem } from '@gabby/types/coachStudent';
import type { LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';

interface Props {
  studentId: string;
  sessions: StudentSessionHistoryItem[];
  lessonSprints: LessonSprintHistoryListItem[];
}

export function TodaysLessonPanel({ studentId, sessions, lessonSprints }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  const now = Date.now();
  const upcomingSession = sessions
    .filter((session) => session.status === SESSION_STATUS.SCHEDULED && new Date(session.start_datetime).getTime() > now)
    .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime())[0];
  const lastCompletedSession = sessions.find((session) => session.status === SESSION_STATUS.COMPLETED);
  const lastSprint = lessonSprints[0];

  return (
    <div className="rounded-2xl border border-indigo-100 bg-linear-to-br from-indigo-50/70 to-white px-5 py-4 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="text-sm font-bold text-slate-800">Today&apos;s Lesson</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
            <span>
              Next session:{' '}
              <span className="text-slate-700">
                {upcomingSession ? formatDateTimeByZone(upcomingSession.start_datetime, timezone, false) : 'Not scheduled'}
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
          <Link
            href={`/students/${studentId}/room`}
            target="_blank"
            rel="noopener noreferrer"
            title="Opens in a new tab, so you can keep sprint and material screens open alongside the call"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors px-3.5 py-2 rounded-full shadow-sm"
          >
            <Video size={14} />
            Start Live Session
            <ExternalLink size={12} className="opacity-70" />
          </Link>
          <Link
            href={`/students/${studentId}/lesson-sprint`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors px-3.5 py-2 rounded-full shadow-sm"
          >
            <Zap size={14} className="fill-current text-amber-300" />
            Start Lesson Sprint
          </Link>
          <span
            title="Dialog practice is coming soon"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-slate-100 px-3.5 py-2 rounded-full cursor-not-allowed"
          >
            <MessageCircle size={14} />
            Dialog Practice
            <span className="text-[9px] font-black uppercase tracking-wide">Soon</span>
          </span>
        </div>
      </div>
    </div>
  );
}
