import { Eye, EyeOff } from 'lucide-react';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import type { SessionHomeworkEntry } from '@gabby/types/sessionHomework';

interface HomeworkViewedStatusProps {
  homework: Pick<SessionHomeworkEntry, 'student_viewed_at' | 'comments'>;
  timezone: string;
}

/**
 * 生徒が宿題を開いたか（student_viewed_at。生徒がセッション結果画面を開いた時に記録される）。
 * 最新の追記コメントより後に開いていなければ、その旨も出す。結果画面の宿題とハブの前回の宿題で共用する。
 */
export function HomeworkViewedStatus({ homework, timezone }: HomeworkViewedStatusProps) {
  const viewedAt = homework.student_viewed_at;
  if (!viewedAt) {
    return (
      <p
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"
        data-testid="homework-viewed-status"
      >
        <EyeOff size={12} className="shrink-0" />
        Not viewed by the student yet
      </p>
    );
  }
  const latestComment = homework.comments[0];
  const hasUnseenComment = !!latestComment && latestComment.insert_date > viewedAt;
  return (
    <p
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500"
      data-testid="homework-viewed-status"
    >
      <Eye size={12} className="shrink-0" />
      Viewed by the student · {formatDateTimeEn(viewedAt, timezone)}
      {hasUnseenComment && <span className="text-amber-700"> · your latest comment isn’t viewed yet</span>}
    </p>
  );
}
