import { GraduationCap } from 'lucide-react';
import { StudentCard } from './StudentCard';
import type { AssignedStudentSummary } from '@gabby/types/coachStudent';

interface Props {
  students: AssignedStudentSummary[];
}

export function StudentListView({ students }: Props) {
  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-200">
        <GraduationCap size={28} className="text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-500">No students assigned yet</p>
        <p className="text-[11px] text-slate-400 mt-1.5">Students will appear here once a matching request is approved.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {students.map((student) => (
        <StudentCard key={student.student_id} student={student} />
      ))}
    </div>
  );
}
