import Link from 'next/link';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { getAssignedStudents } from '@/actions/studentAction';
import { StudentCard } from '../../students/_components/StudentCard';

const PREVIEW_COUNT = 6;

export default async function AssignedStudentsPanel() {
  const students = await getAssignedStudents();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">Your Students</h2>
        {students.length > 0 && (
          <Link
            href="/students"
            className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            View all <ArrowRight size={13} />
          </Link>
        )}
      </div>

      {students.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl border border-slate-200">
          <GraduationCap size={24} className="text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-500">No students assigned yet</p>
          <p className="text-[11px] text-slate-400 mt-1.5">Students will appear here once a matching request is approved.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.slice(0, PREVIEW_COUNT).map((student) => (
            <StudentCard key={student.student_id} student={student} />
          ))}
        </div>
      )}
    </section>
  );
}
