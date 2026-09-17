'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import type { CoachStudentNote } from '@gabby/types/coachStudent';

interface Props {
  note: CoachStudentNote;
}

/**
 * 1件のメモを表す開閉式(アコーディオン)の行。メモは自分専用の単純な追記型履歴のため、
 * TrainingReportEntryと違い編集操作は持たず、折りたたみ時は内容の1行プレビュー、
 * 展開時は全文+登録日時を表示するだけのシンプルな構成にする。
 */
export function CoachNoteEntry({ note }: Props) {
  const timezone = useTimezone();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-slate-100 bg-white">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex flex-col gap-0.5 px-2.5 py-2 text-left group"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-400">{formatDateTimeEn(note.insert_date, timezone)}</span>
          {isExpanded ? (
            <ChevronDown size={14} className="text-slate-400 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 shrink-0" />
          )}
        </span>
        {!isExpanded && <span className="text-xs text-slate-600 truncate">{note.note_text}</span>}
      </button>

      {isExpanded && (
        <div className="px-2.5 pb-2.5 pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-700 whitespace-pre-wrap">{note.note_text}</p>
        </div>
      )}
    </div>
  );
}
