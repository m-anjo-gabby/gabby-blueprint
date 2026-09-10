import { notFound } from 'next/navigation';
import {
  getStudentOverview,
  getStudentLiveSessionContracts,
  getStudentSessionsByTicket,
  getStudentUpcomingSession,
  getStudentLiveSessionShortfalls,
  getStudentNotes,
} from '@/actions/studentAction';
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

  const [contracts, upcomingSession, sessionShortfalls, notes, lessonSprints] = await Promise.all([
    getStudentLiveSessionContracts(id),
    getStudentUpcomingSession(id),
    getStudentLiveSessionShortfalls(id),
    getStudentNotes(id),
    getLessonSprintHistory(id),
  ]);

  // 現在有効な契約を優先し、無ければ直近の過去契約(contractsはstart_date降順)を初期選択とする
  const initialContract = contracts.find((c) => c.is_current) ?? contracts[0] ?? null;
  const initialSessions = initialContract ? await getStudentSessionsByTicket(id, initialContract.ticket_id) : [];

  return (
    <div className="space-y-6">
      <StudentOverviewHeader profile={overview.profile} upcomingSession={upcomingSession} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <LiveSessionHistoryCard
          studentId={id}
          studentName={overview.profile.user_name}
          contracts={contracts}
          initialTicketId={initialContract?.ticket_id ?? null}
          initialSessions={initialSessions}
          shortfalls={sessionShortfalls}
        />
        <LessonSprintCard studentId={id} history={lessonSprints} />
        <div className="lg:col-span-2">
          <CoachNotesCard studentId={id} initialNotes={notes} />
        </div>
      </div>
    </div>
  );
}
