import { notFound } from 'next/navigation';
import { getStudentOverview } from '@/actions/studentAction';
import { getAvailableDialogueContents, getStudentDialogueAssignments } from '@/actions/dialogueAction';
import { DialoguePracticeManager } from './_components/DialoguePracticeManager';
import { StudentChildPageHeader } from '../../_components/StudentsSkeletons';

export default async function DialoguePracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const overview = await getStudentOverview(id);

  if (!overview.success) {
    notFound();
  }

  const [availableContents, assignments] = await Promise.all([
    getAvailableDialogueContents(id),
    getStudentDialogueAssignments(id),
  ]);

  return (
    <div className="space-y-6">
      <StudentChildPageHeader studentId={id} title="Dialogue Practice" studentName={overview.profile.user_name} className="max-w-3xl" />

      <div className="max-w-3xl mx-auto">
        <DialoguePracticeManager
          studentId={id}
          availableContents={availableContents}
          initialAssignments={assignments}
        />
      </div>
    </div>
  );
}
