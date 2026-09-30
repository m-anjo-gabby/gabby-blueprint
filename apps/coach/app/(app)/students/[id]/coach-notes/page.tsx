import { notFound } from 'next/navigation';
import { getStudentOverview, getStudentNotes } from '@/actions/studentAction';
import { CoachNotesHistoryList } from './_components/CoachNotesHistoryList';
import { StudentChildPageHeader } from '../../_components/StudentsSkeletons';

export default async function CoachNotesHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const overview = await getStudentOverview(id);

  if (!overview.success) {
    notFound();
  }

  const notes = await getStudentNotes(id);

  return (
    <div className="space-y-6">
      <StudentChildPageHeader studentId={id} title="Coach Notes" studentName={overview.profile.user_name} className="max-w-2xl" />

      <div className="max-w-2xl mx-auto">
        <CoachNotesHistoryList notes={notes} />
      </div>
    </div>
  );
}
