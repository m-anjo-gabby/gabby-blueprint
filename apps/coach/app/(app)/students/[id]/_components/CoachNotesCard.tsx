'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, StickyNote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';
import { addCoachStudentNote } from '@/actions/studentAction';
import type { CoachStudentNote } from '@gabby/types/coachStudent';
import { CoachNoteEntry } from './CoachNoteEntry';

const COACH_NOTES_CARD_LIMIT = 5;

interface Props {
  studentId: string;
  /** 表示対象のメモ一覧。直近5件に絞る等のスコープ判断は呼び出し側(page.tsx)で行う */
  initialNotes: CoachStudentNote[];
}

export function CoachNotesCard({ studentId, initialNotes }: Props) {
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
      setNotes((prev) => [result.note, ...prev].slice(0, COACH_NOTES_CARD_LIMIT));
      setDraft('');
      showToast('Note saved.', 'success');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <StickyNote size={14} className="text-slate-400" />
            Coach Notes
          </CardTitle>
          <p className="text-[11px] text-slate-400">Private notes only visible to you. Newest first.</p>
        </div>
        <Link
          href={`/students/${studentId}/coach-notes`}
          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors shrink-0"
        >
          View all notes
        </Link>
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
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {notes.map((note) => (
              <li key={note.note_id}>
                <CoachNoteEntry note={note} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
