import { notFound } from 'next/navigation';
import {
  getStudentOverview,
  getStudentLiveSessionContracts,
  getStudentSessionsByTicket,
  getStudentUpcomingSession,
  getStudentLiveSessionShortfalls,
  getStudentNotes,
  getContractTrainingReports,
} from '@/actions/studentAction';
import { getLessonSprintHistory } from '@/actions/lessonSprintAction';
import { getStudentDialogueAssignments, getAvailableDialogueContents } from '@/actions/dialogueAction';
import { StudentOverviewHeader } from './_components/StudentOverviewHeader';
import { LiveSessionHistoryCard } from './_components/LiveSessionHistoryCard';
import { CoachNotesCard } from './_components/CoachNotesCard';
import { TrainingReportCard } from './_components/TrainingReportCard';
import { LessonSprintCard } from './_components/LessonSprintCard';
import { DialoguePracticeCard } from './_components/DialoguePracticeCard';

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

  const [contracts, upcomingSession, sessionShortfalls, notes, lessonSprints, trainingReports, dialogueAssignments, dialogueContents] = await Promise.all([
    getStudentLiveSessionContracts(id),
    getStudentUpcomingSession(id),
    getStudentLiveSessionShortfalls(id),
    getStudentNotes(id),
    getLessonSprintHistory(id),
    getContractTrainingReports(id),
    getStudentDialogueAssignments(id),
    getAvailableDialogueContents(),
  ]);

  // 現在有効な契約を優先し、無ければ直近の過去契約(contractsはstart_date降順)を初期選択とする
  const initialContract = contracts.find((c) => c.is_current) ?? contracts[0] ?? null;
  const initialSessions = initialContract ? await getStudentSessionsByTicket(id, initialContract.ticket_id) : [];

  // Training Reportsカードは直近5件の契約のみを表示し、それより古い分はtraining-reports一覧ページへ誘導する
  // (contractsはstart_date降順のため先頭5件で足りる)
  const recentContracts = contracts.slice(0, 5);

  // Coach Notesカードも同様に直近5件のみを表示し、それより古い分はcoach-notes一覧ページへ誘導する
  // (notesはinsert_date降順のため先頭5件で足りる)
  const recentNotes = notes.slice(0, 5);

  return (
    <div className="space-y-6">
      <StudentOverviewHeader profile={overview.profile} upcomingSession={upcomingSession} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <LiveSessionHistoryCard
          studentId={id}
          studentName={overview.profile.user_name}
          studentTimezone={overview.profile.timezone}
          contracts={contracts}
          initialTicketId={initialContract?.ticket_id ?? null}
          initialSessions={initialSessions}
          shortfalls={sessionShortfalls}
        />
        <LessonSprintCard studentId={id} history={lessonSprints} />
        <DialoguePracticeCard studentId={id} assignments={dialogueAssignments} availableContents={dialogueContents} />
        <CoachNotesCard studentId={id} initialNotes={recentNotes} />
        <TrainingReportCard studentId={id} contracts={recentContracts} initialReports={trainingReports} />
      </div>
    </div>
  );
}
