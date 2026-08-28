import { notFound } from 'next/navigation';
import { getStudentOverview, getStudentSessionHistory, getStudentNotes } from '@/actions/studentAction';
import { StudentOverviewHeader } from './_components/StudentOverviewHeader';
import { SprintProgressCard } from './_components/SprintProgressCard';
import { LiveSessionHistoryCard } from './_components/LiveSessionHistoryCard';
import { CoachNotesCard } from './_components/CoachNotesCard';

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

  const [sessions, notes] = await Promise.all([getStudentSessionHistory(id), getStudentNotes(id)]);

  return (
    <div className="space-y-6">
      <StudentOverviewHeader profile={overview.profile} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SprintProgressCard progress={overview.profile.sprint_progress} />
        <LiveSessionHistoryCard sessions={sessions} />
        <div className="lg:col-span-2">
          <CoachNotesCard studentId={id} initialNotes={notes} />
        </div>
      </div>
    </div>
  );
}
