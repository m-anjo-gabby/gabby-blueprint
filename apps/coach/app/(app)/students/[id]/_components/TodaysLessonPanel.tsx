'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, SquareArrowOutUpRight } from 'lucide-react';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import type { StudentSessionHistoryItem } from '@gabby/types/coachStudent';

interface Props {
  studentId: string;
  /**
   * 次に実施可能な(status=scheduled かつ終了予定時刻が未来の)セッション。存在しなければnull。
   * ハブ導線の対象を決める、サーバー側の専用クエリ（getStudentUpcomingSession）の結果をそのまま使う。
   */
  upcomingSession: StudentSessionHistoryItem | null;
}

/**
 * 直近セッションへの導線のみに絞ったパネル。以前は「Last live session」「Last sprint」も
 * 要約表示していたが、すぐ下のLive Sessions/Live Sprintカードに同じ情報の一覧が既にあるため
 * 重複を廃止した（このパネルの役目は「次のセッションを開く」ことだけに絞る）。
 */
export function TodaysLessonPanel({ studentId, upcomingSession }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  return (
    <div className="space-y-2">
      <h2 className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-indigo-600">
        <CalendarClock size={12} />
        Next Live Session
      </h2>
      {upcomingSession ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* 日時をハブ画面よりさらに強調表示し、直後にハブへの導線を隣接させる
              （誤ったセッションを開いてしまうことを防ぐため、視認性を優先） */}
          <div className="rounded-xl bg-white/70 border border-indigo-100 px-4 py-2.5">
            <p className="text-lg font-black text-slate-800 tracking-tight">
              {formatDateTimeEn(upcomingSession.start_datetime, timezone)}
            </p>
          </div>
          <Link
            href={`/students/${studentId}/sessions/${upcomingSession.session_id}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors px-4 py-2.5 rounded-full shadow-md shadow-indigo-200"
          >
            Open Session
            <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold text-slate-500">No upcoming session scheduled.</p>
          <Link
            href={`/students/${studentId}/lesson-sprint`}
            title="No upcoming live session — start a standalone Live Sprint (e.g. run over an external call)"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors px-4 py-2.5 rounded-full shadow-sm"
          >
            Start Live Sprint
            <SquareArrowOutUpRight size={12} className="opacity-70" />
          </Link>
        </div>
      )}
    </div>
  );
}
