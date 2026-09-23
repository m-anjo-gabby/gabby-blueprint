import Link from 'next/link';
import { ChevronLeft, Home } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DIALOGUE_CATEGORIES } from '@gabby/types/dialogue';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';
import { cn } from '@/lib/utils';
import { DialogueSessionRow } from './DialogueSessionRow';

interface Props {
  assignment: DialogueAssignmentSummary;
}

const NAV_BUTTON_CLASS =
  "h-9 w-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 shadow-3xs hover:bg-slate-100 active:scale-95 transition-all cursor-pointer shrink-0";

// 生徒用：割当済みダイアログ教材の進捗確認・スライドアクセス専用画面（読み取り専用）
export function DialoguePracticeDetail({ assignment }: Props) {
  const progressPercent =
    assignment.total_session_count > 0
      ? (assignment.completed_session_count / assignment.total_session_count) * 100
      : 0;

  return (
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50 space-y-5">
        {/* ライブラリから2階層目の画面のため、1つ戻る（ライブラリ）とホーム（ダッシュボード）を並置する
            （/training/sprint/play の SprintSelect と同じナビゲーション構成）。
            画面名「ダイアログ」はLibrary画面と同様、ナビゲーションと同じ行に配置する */}
        <div className="flex items-center gap-3">
          <Link href="/library" className={cn(NAV_BUTTON_CLASS, "hover:text-slate-600")}>
            <ChevronLeft size={20} strokeWidth={2.5} />
          </Link>
          <Link href="/dashboard" className={cn(NAV_BUTTON_CLASS, "hover:text-indigo-600")} title="ダッシュボードに戻る">
            <Home size={18} strokeWidth={2.5} />
          </Link>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">ダイアログ</h1>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-start gap-2 flex-wrap">
            {/* 教材名は一覧(ContentCard)の見出しと同じ大きさで視認性を確保。長い場合は省略せず折り返す */}
            <p className="text-lg font-black text-slate-800 tracking-tight leading-tight">{assignment.content_name}</p>
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 shrink-0 mt-0.5">
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
