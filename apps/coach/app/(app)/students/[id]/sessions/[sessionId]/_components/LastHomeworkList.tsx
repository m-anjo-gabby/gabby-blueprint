'use client';

import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import type { SessionHomeworkEntry } from '@gabby/types/sessionHomework';
import { HomeworkViewedStatus } from '@/components/session/HomeworkViewedStatus';

/** Session Hub「Last Homework」の一覧（投稿日時はコーチのタイムゾーンで表示する。生徒が見たかも出す） */
export function LastHomeworkList({ entries }: { entries: SessionHomeworkEntry[] }) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  if (entries.length === 0) {
    return <p className="text-xs text-slate-400 italic">No homework posted yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.homework_id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
          <p className="text-[10px] font-bold text-slate-400">{formatDateTimeEn(entry.insert_date, timezone)}</p>
          {entry.homework_text && (
            <p className="text-xs text-slate-700 mt-0.5 line-clamp-2 whitespace-pre-wrap wrap-break-word">
              {entry.homework_text}
            </p>
          )}
          <div className="mt-1">
            <HomeworkViewedStatus homework={entry} timezone={timezone} />
          </div>
        </li>
      ))}
    </ul>
  );
}
