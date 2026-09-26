import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getContentTypeConfig } from '@gabby/lib/content/ui';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import { HomeCard, ProgressBar } from './HomeCard';

const MAX_ITEMS = 3;

// コーチからの課題はダイアログ教材のため、ダイアログの分類色・アイコンで表示する
const DIALOGUE = getContentTypeConfig(3);

interface CoachAssignmentsCardProps {
  assignments: DialogueAssignmentSummary[];
}

/** コーチから割り当てられた、未完了のダイアログ教材 */
export function CoachAssignmentsCard({ assignments }: CoachAssignmentsCardProps) {
  return (
    <HomeCard title="コーチからの課題">
      <ul className="-mx-2 space-y-1">
        {assignments.slice(0, MAX_ITEMS).map((assignment) => {
          const percent =
            assignment.total_session_count > 0
              ? (assignment.completed_session_count / assignment.total_session_count) * 100
              : 0;
          return (
            <li key={assignment.assignment_id}>
              <Link
                href={`/training/dialogue/${assignment.assignment_id}`}
                className="group flex items-center gap-3 rounded-control p-2 hover:bg-slate-50 transition-colors"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control ${DIALOGUE.theme.iconTile}`}>
                  <DIALOGUE.icon size={18} />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="truncate text-sm font-bold text-ink">{assignment.content_name}</p>
                  <div className="flex items-center gap-3">
                    <ProgressBar percent={percent} />
                    <span className="shrink-0 text-[11px] text-ink-muted">
                      {assignment.completed_session_count}/{assignment.total_session_count} 完了
                    </span>
                  </div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-ink-subtle group-hover:text-ink-muted transition-colors" />
              </Link>
            </li>
          );
        })}
      </ul>
    </HomeCard>
  );
}
