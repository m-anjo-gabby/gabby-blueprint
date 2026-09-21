'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessagesSquare, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DIALOGUE_CATEGORIES } from '@gabby/types/dialogue';
import type { DialogueAssignmentSummary, DialogueContentSummary } from '@gabby/types/dialogue';
import { useDialoguePracticeAssignments } from '../_hooks/useDialoguePracticeAssignments';
import { AssignDialogueDialog } from './AssignDialogueDialog';
import { DialogueSessionRow } from '../dialogue-practice/_components/DialogueSessionRow';

interface Props {
  studentId: string;
  assignments: DialogueAssignmentSummary[];
  availableContents: DialogueContentSummary[];
}

export function DialoguePracticeCard({ studentId, assignments: initialAssignments, availableContents }: Props) {
  const [isAssignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const { assignments, assignedContentIds, handleAssigned, handleProgressChange } = useDialoguePracticeAssignments(
    studentId,
    initialAssignments
  );

  // 概要パネルは対応中のセットに絞って表示する（完了済みはManageページで確認する運用）
  const incompleteAssignments = assignments.filter((a) => !a.is_set_completed);
  const selectedAssignment = assignments.find((a) => a.assignment_id === selectedAssignmentId) ?? null;

  const onAssigned = async () => {
    setAssignDialogOpen(false);
    await handleAssigned();
  };

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <MessagesSquare size={14} className="text-slate-400" />
          Dialogue Practice
        </CardTitle>
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" onClick={() => setAssignDialogOpen(true)}>
            <Plus size={14} />
            Assign
          </Button>
          <Link
            href={`/students/${studentId}/dialogue-practice`}
            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            Manage
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <MessagesSquare size={22} className="text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-400">No dialogue sets assigned yet</p>
          </div>
        ) : incompleteAssignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <MessagesSquare size={22} className="text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-400">All assigned sets are completed</p>
          </div>
        ) : (
          <ul className="space-y-1 max-h-96 overflow-y-auto">
            {incompleteAssignments.map((a) => (
              <li key={a.assignment_id}>
                <button
                  type="button"
                  onClick={() => setSelectedAssignmentId(a.assignment_id)}
                  className="w-full space-y-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-slate-700">{a.content_name}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
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
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AssignDialogueDialog
        open={isAssignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        studentId={studentId}
        availableContents={availableContents}
        assignedContentIds={assignedContentIds}
        onAssigned={onAssigned}
      />

      <Dialog open={selectedAssignment !== null} onOpenChange={(open) => !open && setSelectedAssignmentId(null)}>
        <DialogContent className="sm:max-w-lg">
          {selectedAssignment && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedAssignment.content_name}</DialogTitle>
                <DialogDescription>
                  {selectedAssignment.completed_session_count}/{selectedAssignment.total_session_count} sessions completed
                </DialogDescription>
              </DialogHeader>
              <div className="-mt-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                  {DIALOGUE_CATEGORIES[selectedAssignment.category_id].label}
                </Badge>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {selectedAssignment.sessions.map((session) => (
                  <DialogueSessionRow
                    key={session.dialogue_session_id}
                    assignmentId={selectedAssignment.assignment_id}
                    session={session}
                    onProgressChange={handleProgressChange}
                  />
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
