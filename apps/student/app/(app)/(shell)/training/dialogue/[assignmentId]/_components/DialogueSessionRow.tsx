import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DialogueAssignmentSessionView } from '@gabby/types/dialogue';

interface Props {
  session: DialogueAssignmentSessionView;
}

// 生徒用：進捗表示と教材リンクのみの読み取り専用行（完了操作・コーチメモはコーチ側の機能のため表示しない）
export function DialogueSessionRow({ session }: Props) {
  return (
    <div className="space-y-2 rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-bold text-ink">セッション {session.session_no}</p>
        {session.is_completed && (
          <Badge className="gap-1 border-none bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={12} />
            完了
          </Badge>
        )}
      </div>

      {session.is_completed && session.completed_date && (
        <p className="text-xs text-ink-muted">完了日: {session.completed_date}</p>
      )}

      {session.student_slides_link ? (
        <a
          href={session.student_slides_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-strong transition-colors"
        >
          <ExternalLink size={14} />
          教材を開く
        </a>
      ) : (
        <p className="text-xs text-ink-subtle">教材は未登録です</p>
      )}
    </div>
  );
}
