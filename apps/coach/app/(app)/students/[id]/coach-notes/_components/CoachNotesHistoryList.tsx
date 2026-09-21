'use client';

import { StickyNote } from 'lucide-react';
import type { CoachStudentNote } from '@gabby/types/coachStudent';
import { CoachNoteEntry } from '../../_components/CoachNoteEntry';

interface Props {
  notes: CoachStudentNote[];
}

export function CoachNotesHistoryList({ notes }: Props) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <StickyNote size={22} className="text-slate-300 mb-2" />
        <p className="text-xs font-semibold text-slate-400">No notes yet</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {notes.map((note) => (
        <li key={note.note_id}>
          <CoachNoteEntry note={note} />
        </li>
      ))}
    </ul>
  );
}
