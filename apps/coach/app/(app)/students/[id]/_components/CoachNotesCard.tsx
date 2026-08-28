'use client';

import { useState } from 'react';
import { Loader2, StickyNote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { addCoachStudentNote } from '@/actions/studentAction';
import type { CoachStudentNote } from '@gabby/types/coachStudent';

interface Props {
  studentId: string;
  initialNotes: CoachStudentNote[];
}

export function CoachNotesCard({ studentId, initialNotes }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [notes, setNotes] = useState<CoachStudentNote[]>(initialNotes);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  const handleSave = async () => {
    if (!draft.trim()) {
      showToast('Please enter a note before saving.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const result = await addCoachStudentNote(studentId, draft);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      setNotes((prev) => [result.note, ...prev]);
      setDraft('');
      showToast('Note saved.', 'success');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-800">Coach Notes</CardTitle>
        <p className="text-[11px] text-slate-400">Private notes only visible to you. Newest first.</p>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Struggling with past perfect tense, review in next session."
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              Save Note
            </Button>
          </div>
        </div>

        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <StickyNote size={22} className="text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-400">No notes yet</p>
          </div>
        ) : (
          <ul className="space-y-2.5 max-h-96 overflow-y-auto">
            {notes.map((note) => (
              <li key={note.note_id} className="px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60">
                <p className="text-xs text-slate-700 whitespace-pre-wrap">{note.note_text}</p>
                <p className="text-[10px] text-slate-400 mt-1.5">{formatDateTimeByZone(note.insert_date, timezone, false)}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
