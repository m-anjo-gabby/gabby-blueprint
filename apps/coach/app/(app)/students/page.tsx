import { getAssignedStudents } from '@/actions/studentAction';
import { StudentListView } from './_components/StudentListView';

export default async function StudentsPage() {
  const students = await getAssignedStudents();

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">My Students</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Students currently matched with you. Select a student to view sprint progress, live session history, and your private notes in one place.
        </p>
      </div>

      <StudentListView students={students} />
    </div>
  );
}
