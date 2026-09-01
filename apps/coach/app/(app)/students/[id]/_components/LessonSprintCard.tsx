'use client';

import Link from 'next/link';
import { Zap, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { QUESTION_TYPES } from '@gabby/types/sprint';
import type { LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';

interface Props {
  studentId: string;
  history: LessonSprintHistoryListItem[];
}

export function LessonSprintCard({ studentId, history }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-800">Lesson Sprint</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Zap size={22} className="text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-400">No lesson sprints yet</p>
          </div>
        ) : (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {history.map((record) => {
              const typeLabel = QUESTION_TYPES[record.question_type as keyof typeof QUESTION_TYPES]?.label ?? record.question_type;
              return (
                <li key={record.lesson_sprint_id}>
                  <Link
                    href={`/students/${studentId}/lesson-sprint/result/${record.lesson_sprint_id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-200 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{record.content_name}</p>
                      <p className="text-[11px] text-slate-400">
                        {typeLabel} · Lv.{record.difficulty_level} · {formatDateTimeByZone(record.insert_date, timezone, false)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1">
                        {record.average_score !== null ? `${record.average_score}/5` : '—'}
                      </span>
                      <ChevronRight size={14} className="text-slate-300" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
