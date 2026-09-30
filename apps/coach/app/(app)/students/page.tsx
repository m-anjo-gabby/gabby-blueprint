import { getAssignedStudents } from '@/actions/studentAction';
import { StudentListView } from './_components/StudentListView';
import { StudentsPageHeader } from './_components/StudentsSkeletons';

export default async function StudentsPage() {
  const students = await getAssignedStudents();

  return (
    <div className="space-y-6">
      <StudentsPageHeader />

      <StudentListView students={students} />
    </div>
  );
}
