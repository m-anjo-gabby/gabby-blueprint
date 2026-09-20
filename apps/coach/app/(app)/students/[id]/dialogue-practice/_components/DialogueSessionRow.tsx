'use client';

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
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

  const handleCompletedChange = async (checked: boolean) => {
    setIsSaving(true);
    try {
      await onProgressChange({
        assignment_id: assignmentId,
        dialogue_session_id: session.dialogue_session_id,
        is_completed: checked,
        notes: notesDraft,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotesBlur = async () => {
    if (notesDraft === (session.notes ?? '')) return;
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
      <div className="flex items-start gap-3">
        <Checkbox
          checked={session.is_completed}
          onCheckedChange={(checked) => handleCompletedChange(checked === true)}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700">Session {session.session_no}</p>
            {isSaving && <Loader2 size={12} className="animate-spin text-slate-400" />}
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
            onBlur={handleNotesBlur}
            placeholder="Session notes..."
            className="text-xs"
          />
        </div>
      </div>
    </div>
  );
}
