'use client';

import { useState } from 'react';
import { Plus, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';
import {
  getStudentDialogueAssignments,
  unassignDialogueContent,
  updateDialogueSessionProgress,
} from '@/actions/dialogueAction';
import type {
  DialogueAssignmentSummary,
  DialogueContentSummary,
  UpdateDialogueSessionProgressInput,
} from '@gabby/types/dialogue';
import { AssignDialogueDialog } from './AssignDialogueDialog';
import { DialogueAssignmentCard } from './DialogueAssignmentCard';

interface Props {
  studentId: string;
  availableContents: DialogueContentSummary[];
  initialAssignments: DialogueAssignmentSummary[];
}

export function DialoguePracticeManager({ studentId, availableContents, initialAssignments }: Props) {
  const [assignments, setAssignments] = useState<DialogueAssignmentSummary[]>(initialAssignments);
  const [isAssignDialogOpen, setAssignDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { showToast } = useToast();

  const assignedContentIds = new Set(assignments.map((a) => a.content_id));

  const handleAssigned = async () => {
    setAssignDialogOpen(false);
    setIsRefreshing(true);
    try {
      const result = await getStudentDialogueAssignments(studentId);
      setAssignments(result);
      showToast('Dialogue set assigned.', 'success');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    const result = await unassignDialogueContent(assignmentId);
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setAssignments((prev) => prev.filter((a) => a.assignment_id !== assignmentId));
    showToast('Dialogue set unassigned.', 'success');
  };

  const handleProgressChange = async (input: UpdateDialogueSessionProgressInput) => {
    const result = await updateDialogueSessionProgress(input);
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    const trimmedNotes = input.notes?.trim() ?? '';
    setAssignments((prev) =>
      prev.map((a) => {
        if (a.assignment_id !== input.assignment_id) return a;
        const sessions = a.sessions.map((s) => {
          if (s.dialogue_session_id !== input.dialogue_session_id) return s;
          return {
            ...s,
            is_completed: input.is_completed,
            notes: trimmedNotes.length > 0 ? trimmedNotes : null,
            completed_date: input.is_completed
              ? (s.is_completed ? s.completed_date : new Date().toISOString().slice(0, 10))
              : null,
          };
        });
        const completedCount = sessions.filter((s) => s.is_completed).length;
        return {
          ...a,
          sessions,
          completed_session_count: completedCount,
          is_set_completed: sessions.length > 0 && completedCount === sessions.length,
        };
      })
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => setAssignDialogOpen(true)} disabled={isRefreshing}>
          <Plus size={14} />
          Assign Set
        </Button>
      </div>

      {assignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 rounded-2xl">
          <MessagesSquare size={24} className="text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-400">No dialogue sets assigned yet</p>
          <p className="text-xs text-slate-400 mt-1">Assign a set to start tracking this student&apos;s progress.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => (
            <DialogueAssignmentCard
              key={assignment.assignment_id}
              assignment={assignment}
              onUnassign={() => handleUnassign(assignment.assignment_id)}
              onProgressChange={handleProgressChange}
            />
          ))}
        </div>
      )}

      <AssignDialogueDialog
        open={isAssignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        studentId={studentId}
        availableContents={availableContents}
        assignedContentIds={assignedContentIds}
        onAssigned={handleAssigned}
      />
    </div>
  );
}
