'use client';

import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DIALOGUE_CATEGORIES } from '@gabby/types/dialogue';
import type { DialogueAssignmentSummary } from '@gabby/types/dialogue';

interface Props {
  studentId: string;
  assignments: DialogueAssignmentSummary[];
}

export function DialoguePracticeCard({ studentId, assignments }: Props) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <MessagesSquare size={14} className="text-slate-400" />
          Dialogue Practice
        </CardTitle>
        <Link
          href={`/students/${studentId}/dialogue-practice`}
          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          Manage
        </Link>
      </CardHeader>
      <CardContent className="pt-2">
        {assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <MessagesSquare size={22} className="text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-400">No dialogue sets assigned yet</p>
          </div>
        ) : (
          <ul className="space-y-3 max-h-96 overflow-y-auto">
            {assignments.map((a) => (
              <li key={a.assignment_id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 truncate">{a.content_name}</span>
                  <Badge variant={a.is_set_completed ? 'default' : 'outline'} className="shrink-0 text-[10px] px-1.5 py-0">
                    {DIALOGUE_CATEGORIES[a.category_id].label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Progress
                    value={a.total_session_count > 0 ? (a.completed_session_count / a.total_session_count) * 100 : 0}
                    className="h-1.5"
                  />
                  <span className="text-[11px] font-medium text-slate-400 shrink-0">
                    {a.completed_session_count}/{a.total_session_count}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
