import Link from 'next/link';
import { ChevronLeft, MessagesSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DIALOGUE_CATEGORIES } from '@gabby/types/dialogue';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import { DialogueSessionRow } from './DialogueSessionRow';

interface Props {
  assignment: DialogueAssignmentSummary;
}

// 生徒用：割当済みダイアログ教材の進捗確認・スライドアクセス専用画面（読み取り専用）
export function DialoguePracticeDetail({ assignment }: Props) {
  const progressPercent =
    assignment.total_session_count > 0
      ? (assignment.completed_session_count / assignment.total_session_count) * 100
      : 0;

  return (
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50 space-y-5">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/library"
            className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400 shrink-0"
          >
            <ChevronLeft size={24} />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <MessagesSquare size={18} strokeWidth={2.5} className="text-teal-600 shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-widest text-teal-600">ダイアログ</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">{assignment.content_name}</h1>
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 shrink-0">
              {DIALOGUE_CATEGORIES[assignment.category_id].label}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400">割当日: {assignment.assigned_date}</p>
        </div>

        <div className="flex items-center gap-3">
          <Progress value={progressPercent} className="h-2 flex-1" />
          <span className="text-[11px] font-black text-slate-400 shrink-0">
            {assignment.completed_session_count}/{assignment.total_session_count} 完了
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 bg-slate-50/50 space-y-3">
        {assignment.sessions.map((session) => (
          <DialogueSessionRow key={session.dialogue_session_id} session={session} />
        ))}
      </div>
    </div>
  );
}
