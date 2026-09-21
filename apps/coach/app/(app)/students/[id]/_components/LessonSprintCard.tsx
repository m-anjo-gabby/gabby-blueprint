'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';
import { LessonSprintHistoryRow } from './LessonSprintHistoryRow';

interface Props {
  studentId: string;
  history: LessonSprintHistoryListItem[];
}

const OVERVIEW_BACK_HREF_PREFIX = '/students/';
const OVERVIEW_BACK_LABEL = 'Back to Overview';

export function LessonSprintCard({ studentId, history }: Props) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Zap size={14} className="fill-current text-amber-400" />
          Live Sprint
        </CardTitle>
        <Link
          href={`/students/${studentId}/lesson-sprint/history`}
          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          View history
        </Link>
      </CardHeader>
      <CardContent className="pt-2">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Zap size={22} className="text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-400">No lesson sprints yet</p>
          </div>
        ) : (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {history.map((record) => (
              <li key={record.lesson_sprint_id}>
                <LessonSprintHistoryRow
                  studentId={studentId}
                  record={record}
                  backHref={`${OVERVIEW_BACK_HREF_PREFIX}${studentId}`}
                  backLabel={OVERVIEW_BACK_LABEL}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
