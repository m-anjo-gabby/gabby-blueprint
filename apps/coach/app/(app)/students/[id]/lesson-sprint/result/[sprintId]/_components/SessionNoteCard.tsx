'use client';

import { useState } from 'react';
import { Loader2, Pencil, StickyNote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';
import { updateLessonSprintSessionNote } from '@/actions/lessonSprintAction';

interface Props {
  lessonSprintId: string;
  initialNote: string | null;
}

export function SessionNoteCard({ lessonSprintId, initialNote }: Props) {
  const [note, setNote] = useState(initialNote ?? '');
  const [draft, setDraft] = useState(initialNote ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  const handleEdit = () => {
    setDraft(note);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await updateLessonSprintSessionNote(lessonSprintId, draft);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      setNote(draft.trim());
      setIsEditing(false);
      showToast('Session note saved.', 'success');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm shrink-0">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <StickyNote size={14} className="text-indigo-500" />
          Session Notes
        </CardTitle>
        {!isEditing && (
          <button
            type="button"
            onClick={handleEdit}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            <Pencil size={11} />
            Edit
          </button>
        )}
      </CardHeader>
      <CardContent className="pt-2">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Focus on past tense pronunciation next session."
              className="text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 size={14} className="animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        ) : note ? (
          <p className="text-sm text-slate-600 whitespace-pre-wrap max-h-40 overflow-y-auto pr-1">{note}</p>
        ) : (
          <p className="text-xs text-slate-400 italic">No session notes yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
