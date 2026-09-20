'use client';

import { useState } from 'react';
import { Check, CheckCircle2, Circle, ExternalLink, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { DialogueAssignmentSessionView, UpdateDialogueSessionProgressInput } from '@gabby/types/dialogue';

interface Props {
  assignmentId: string;
  session: DialogueAssignmentSessionView;
  onProgressChange: (input: UpdateDialogueSessionProgressInput) => Promise<void>;
}

export function DialogueSessionRow({ assignmentId, session, onProgressChange }: Props) {
  const [notesDraft, setNotesDraft] = useState(session.notes ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const notesChanged = notesDraft.trim() !== (session.notes ?? '').trim();

  // 完了/取消の切替は、未保存のメモ下書きを巻き込まないよう常に最後に保存された
  // notesの値をそのまま維持する（メモの保存は下のSave Noteボタンで明示的に行う）
  const handleToggleCompleted = async (nextCompleted: boolean) => {
    setIsSaving(true);
    try {
      await onProgressChange({
        assignment_id: assignmentId,
        dialogue_session_id: session.dialogue_session_id,
        is_completed: nextCompleted,
        notes: session.notes,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!notesChanged) return;
    setIsSaving(true);
    try {
      await onProgressChange({
        assignment_id: assignmentId,
        dialogue_session_id: session.dialogue_session_id,
        is_completed: session.is_completed,
        notes: notesDraft,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {session.is_completed ? (
              <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
            ) : (
              <Circle size={14} className="text-slate-300 shrink-0" />
            )}
            <p className="text-xs font-bold text-slate-700">Session {session.session_no}</p>
          </div>
          <div className="flex items-center gap-2">
            {isSaving && <Loader2 size={12} className="animate-spin text-slate-400" />}
            {session.is_completed ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-slate-500"
                disabled={isSaving}
                onClick={() => handleToggleCompleted(false)}
              >
                <RotateCcw size={12} />
                Cancel
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={isSaving} onClick={() => handleToggleCompleted(true)}>
                <Check size={12} />
                Complete
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {session.coach_slides_link && (
            <a
              href={session.coach_slides_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <ExternalLink size={11} />
              Coach Slides
            </a>
          )}
          {session.student_slides_link && (
            <a
              href={session.student_slides_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <ExternalLink size={11} />
              Student Slides
            </a>
          )}
          {session.is_completed && session.completed_date && (
            <span className="text-slate-400">Completed {session.completed_date}</span>
          )}
        </div>
        <Textarea
          rows={2}
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Session notes..."
          className="text-xs"
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" disabled={isSaving || !notesChanged} onClick={handleSaveNotes}>
            Save Note
          </Button>
        </div>
      </div>
    </div>
  );
}
