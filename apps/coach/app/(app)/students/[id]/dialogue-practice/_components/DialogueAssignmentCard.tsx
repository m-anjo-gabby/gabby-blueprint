'use client';

import { useState } from 'react';
import { Loader2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { DIALOGUE_CATEGORIES } from '@gabby/types/dialogue';
import type { DialogueAssignmentSummary, UpdateDialogueSessionProgressInput } from '@gabby/types/dialogue';
import { DialogueSessionRow } from './DialogueSessionRow';

interface Props {
  assignment: DialogueAssignmentSummary;
  onUnassign: () => Promise<void>;
  onProgressChange: (input: UpdateDialogueSessionProgressInput) => Promise<void>;
}

export function DialogueAssignmentCard({ assignment, onUnassign, onProgressChange }: Props) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isUnassigning, setIsUnassigning] = useState(false);

  const handleUnassignClick = async () => {
    if (!confirm(`Unassign "${assignment.content_name}" from this student?`)) return;
    setIsUnassigning(true);
    try {
      await onUnassign();
    } finally {
      setIsUnassigning(false);
    }
  };

  const progressPercent =
    assignment.total_session_count > 0 ? (assignment.completed_session_count / assignment.total_session_count) * 100 : 0;

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={() => setIsExpanded((v) => !v)} className="flex items-start gap-2 text-left min-w-0">
            {isExpanded ? (
              <ChevronUp size={16} className="mt-0.5 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown size={16} className="mt-0.5 text-slate-400 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-800 truncate">{assignment.content_name}</h3>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                  {DIALOGUE_CATEGORIES[assignment.category_id].label}
                </Badge>
                {assignment.is_set_completed && (
                  <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-emerald-600 hover:bg-emerald-600">Completed</Badge>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Assigned {assignment.assigned_date}</p>
            </div>
          </button>
          <Button type="button" size="sm" variant="ghost" onClick={handleUnassignClick} disabled={isUnassigning}>
            {isUnassigning ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </Button>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <Progress value={progressPercent} className="h-1.5" />
          <span className="text-[11px] font-medium text-slate-400 shrink-0">
            {assignment.completed_session_count}/{assignment.total_session_count}
          </span>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-2 space-y-2">
          {assignment.sessions.map((session) => (
            <DialogueSessionRow
              key={session.dialogue_session_id}
              assignmentId={assignment.assignment_id}
              session={session}
              onProgressChange={onProgressChange}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}
