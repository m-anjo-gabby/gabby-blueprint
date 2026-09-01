import { notFound } from 'next/navigation';
import { getStudentOverview, getStudentSessionHistory, getStudentNotes } from '@/actions/studentAction';
import { getLessonSprintHistory } from '@/actions/lessonSprintAction';
import { StudentOverviewHeader } from './_components/StudentOverviewHeader';
import { LiveSessionHistoryCard } from './_components/LiveSessionHistoryCard';
import { CoachNotesCard } from './_components/CoachNotesCard';
import { LessonSprintCard } from './_components/LessonSprintCard';

export default async function StudentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const overview = await getStudentOverview(id);

  if (!overview.success) {
    notFound();
  }

  const [sessions, notes, lessonSprints] = await Promise.all([
    getStudentSessionHistory(id),
    getStudentNotes(id),
    getLessonSprintHistory(id),
  ]);

  return (
    <div className="space-y-6">
      <StudentOverviewHeader profile={overview.profile} sessions={sessions} lessonSprints={lessonSprints} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <LiveSessionHistoryCard sessions={sessions} />
        <LessonSprintCard studentId={id} history={lessonSprints} />
        <div className="lg:col-span-2">
          <CoachNotesCard studentId={id} initialNotes={notes} />
        </div>
      </div>
    </div>
  );
}
