'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { formatSprintLevelLabel, resolveCoachContentName } from '@gabby/lib';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { QUESTION_TYPES } from '@gabby/types/sprint';
import type { LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';

interface Props {
  studentId: string;
  record: LessonSprintHistoryListItem;
  /** この行から結果画面へ遷移した際、戻り先として引き継ぐ画面（概要カード／履歴一覧画面など呼び出し元ごとに異なる） */
  backHref: string;
  backLabel: string;
}

/**
 * Lesson Sprint実施履歴1件分の行。受講生概要カード（直近10件）と履歴一覧画面（全件）の
 * 両方から共有され、見た目の重複実装を避ける。
 */
export function LessonSprintHistoryRow({ studentId, record, backHref, backLabel }: Props) {
  const timezone = useTimezone();
  const typeLabel = QUESTION_TYPES[record.question_type as keyof typeof QUESTION_TYPES]?.label ?? record.question_type;

  return (
    <Link
      href={`/students/${studentId}/lesson-sprint/result/${record.lesson_sprint_id}?back=${encodeURIComponent(backHref)}&back_label=${encodeURIComponent(backLabel)}`}
      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-200 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700 truncate">{resolveCoachContentName(record)}</p>
        <p className="text-[11px] text-slate-400">
          {typeLabel} · {formatSprintLevelLabel(record.question_type, record.difficulty_level)} · {formatDateTimeEn(record.insert_date, timezone)}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1">
          {record.average_score !== null ? `${record.average_score}/5` : '—'}
        </span>
        <ChevronRight size={14} className="text-slate-300" />
      </div>
    </Link>
  );
}
