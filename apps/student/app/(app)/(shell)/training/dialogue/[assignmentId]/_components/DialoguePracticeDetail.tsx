import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DIALOGUE_CATEGORIES } from '@gabby/types/dialogue';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { DialogueSessionRow } from './DialogueSessionRow';

interface Props {
  assignment: DialogueAssignmentSummary;
}

// 生徒用：割当済みダイアログ教材の進捗確認・教材アクセス専用画面（読み取り専用）
export function DialoguePracticeDetail({ assignment }: Props) {
  const progressPercent =
    assignment.total_session_count > 0
      ? (assignment.completed_session_count / assignment.total_session_count) * 100
      : 0;

  return (
    <>
      {/* ホームの「今日やること」と教材一覧の両方から来るため、直前の画面へ戻す */}
      <ShellPageHeader title="ダイアログ" back={{ history: '/library' }} />

      <section className="mb-6 rounded-card border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-2">
          {/* 教材名は長い場合も省略せず折り返す */}
          <h2 className="text-lg font-bold leading-snug text-ink">{assignment.content_name}</h2>
          <Badge variant="outline" className="mt-0.5 shrink-0 border-line text-xs text-ink-soft">
            {DIALOGUE_CATEGORIES[assignment.category_id].label}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-ink-muted">割当日: {assignment.assigned_date}</p>

        <div className="mt-4 flex items-center gap-3">
          <Progress value={progressPercent} className="h-2 flex-1" />
          <span className="shrink-0 text-sm font-semibold text-ink-soft tabular-nums">
            {assignment.completed_session_count}/{assignment.total_session_count} 完了
          </span>
        </div>
      </section>

      <ul className="space-y-3">
        {assignment.sessions.map((session) => (
          <li key={session.dialogue_session_id}>
            <DialogueSessionRow session={session} />
          </li>
        ))}
      </ul>
    </>
  );
}
