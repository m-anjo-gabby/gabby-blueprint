import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DialogueAssignmentSessionView } from '@gabby/types/dialogue';

interface Props {
  session: DialogueAssignmentSessionView;
}

// 生徒用：進捗表示と教材リンクのみの読み取り専用行（完了操作・コーチメモはコーチ側の機能のため表示しない）
export function DialogueSessionRow({ session }: Props) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-700">セッション {session.session_no}</p>
        {session.is_completed && (
          <Badge className="text-[10px] px-2 py-0.5 gap-1 border-none bg-emerald-100 text-emerald-700 font-black">
            <CheckCircle2 size={11} />
            完了
          </Badge>
        )}
      </div>

      {session.is_completed && session.completed_date && (
        <p className="text-[11px] text-slate-400">完了日: {session.completed_date}</p>
      )}

      {session.student_slides_link ? (
        <a
          href={session.student_slides_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          <ExternalLink size={14} />
          教材を開く
        </a>
      ) : (
        <p className="text-[11px] text-slate-300 italic">教材は未登録です</p>
      )}
    </div>
  );
}
