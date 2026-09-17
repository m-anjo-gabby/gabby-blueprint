'use client';

import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StudentCard } from './StudentCard';
import type { AssignedStudentSummary } from '@gabby/types/coachStudent';

interface Props {
  students: AssignedStudentSummary[];
}

const PAST_STUDENTS_INITIAL_COUNT = 10;

function StudentGrid({ students }: { students: AssignedStudentSummary[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {students.map((student) => (
        <StudentCard key={student.student_id} student={student} />
      ))}
    </div>
  );
}

export function StudentListView({ students }: Props) {
  const [showAllPast, setShowAllPast] = useState(false);

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-200">
        <GraduationCap size={28} className="text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-500">No students assigned yet</p>
        <p className="text-[11px] text-slate-400 mt-1.5">Students will appear here once a matching request is approved.</p>
      </div>
    );
  }

  const activeStudents = students.filter((s) => s.is_active);
  const pastStudents = students.filter((s) => !s.is_active);
  const visiblePastStudents = showAllPast ? pastStudents : pastStudents.slice(0, PAST_STUDENTS_INITIAL_COUNT);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Active Students ({activeStudents.length})</h2>
        {activeStudents.length > 0 ? (
          <StudentGrid students={activeStudents} />
        ) : (
          <p className="text-xs text-slate-400 py-6 text-center bg-white rounded-2xl border border-slate-200">
            No active students right now.
          </p>
        )}
      </section>

      {pastStudents.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Past Students ({pastStudents.length})</h2>
          <StudentGrid students={visiblePastStudents} />
          {!showAllPast && pastStudents.length > PAST_STUDENTS_INITIAL_COUNT && (
            <Button type="button" variant="outline" className="w-full" onClick={() => setShowAllPast(true)}>
              Show all {pastStudents.length} past students
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
