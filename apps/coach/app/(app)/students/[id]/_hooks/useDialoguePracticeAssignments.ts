'use client';

import { useState } from 'react';
import { useToast } from '@gabby/lib/hooks/useToast';
import {
  getStudentDialogueAssignments,
  unassignDialogueContent,
  updateDialogueSessionProgress,
} from '@/actions/dialogueAction';
import type { DialogueAssignmentSummary, UpdateDialogueSessionProgressInput } from '@gabby/types/dialogue';

/**
 * 生徒概要の要約カード(DialoguePracticeCard)と管理ページ(DialoguePracticeManager)の
 * 両方から使う、割当一覧の状態管理・更新ロジック。
 */
export function useDialoguePracticeAssignments(studentId: string, initialAssignments: DialogueAssignmentSummary[]) {
  const [assignments, setAssignments] = useState<DialogueAssignmentSummary[]>(initialAssignments);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { showToast } = useToast();

  const assignedContentIds = new Set(assignments.map((a) => a.content_id));

  const handleAssigned = async () => {
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

  return { assignments, assignedContentIds, isRefreshing, handleAssigned, handleUnassign, handleProgressChange };
}
