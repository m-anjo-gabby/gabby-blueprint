import { cache } from 'react';
import {
  getStudentLiveSessionContracts,
  getStudentSessionsByTicket,
  getStudentLiveSessionShortfalls,
  getStudentNotes,
  getContractTrainingReports,
} from '@/actions/studentAction';
import { getLessonSprintHistory } from '@/actions/lessonSprintAction';
import { getStudentDialogueAssignments, getAvailableDialogueContents } from '@/actions/dialogueAction';
import type { StudentOverviewProfile } from '@gabby/types/coachStudent';
import { LiveSessionHistoryCard } from './LiveSessionHistoryCard';
import { CoachNotesCard } from './CoachNotesCard';
import { TrainingReportCard } from './TrainingReportCard';
import { LessonSprintCard } from './LessonSprintCard';
import { DialoguePracticeCard } from './DialoguePracticeCard';

/*
 * 生徒概要画面のカード単位のデータ取得。
 * 各カードを page.tsx 側で個別の <Suspense> に包み、取得が終わったカードから順に表示する
 * （最も遅い取得を待たずに画面を出すため）。
 */

// 契約一覧は Live Sessions / Training Reports の両カードで使うため、1リクエスト内で1回だけ取得する
const getContracts = cache(getStudentLiveSessionContracts);

export async function LiveSessionHistorySection({ studentId, profile }: { studentId: string; profile: StudentOverviewProfile }) {
  const [contracts, shortfalls] = await Promise.all([
    getContracts(studentId),
    getStudentLiveSessionShortfalls(studentId),
  ]);

  // 現在有効な契約を優先し、無ければ直近の過去契約(contractsはstart_date降順)を初期選択とする
  const initialContract = contracts.find((c) => c.is_current) ?? contracts[0] ?? null;
  const initialSessions = initialContract ? await getStudentSessionsByTicket(studentId, initialContract.ticket_id) : [];

  return (
    <LiveSessionHistoryCard
      studentId={studentId}
      studentName={profile.user_name}
      studentTimezone={profile.timezone}
      contracts={contracts}
      initialTicketId={initialContract?.ticket_id ?? null}
      initialSessions={initialSessions}
      shortfalls={shortfalls}
    />
  );
}

export async function LessonSprintSection({ studentId }: { studentId: string }) {
  const history = await getLessonSprintHistory(studentId);
  return <LessonSprintCard studentId={studentId} history={history} />;
}

export async function DialoguePracticeSection({ studentId }: { studentId: string }) {
  const [assignments, availableContents] = await Promise.all([
    getStudentDialogueAssignments(studentId),
    getAvailableDialogueContents(studentId),
  ]);
  return (
    <DialoguePracticeCard
      studentId={studentId}
      assignments={assignments}
      availableContents={availableContents}
      manageHref={`/students/${studentId}/dialogue-practice`}
    />
  );
}

export async function CoachNotesSection({ studentId }: { studentId: string }) {
  const notes = await getStudentNotes(studentId);
  // 直近5件のみを表示し、それより古い分はcoach-notes一覧ページへ誘導する
  // (notesはinsert_date降順のため先頭5件で足りる)
  return <CoachNotesCard studentId={studentId} initialNotes={notes.slice(0, 5)} />;
}

export async function TrainingReportSection({ studentId }: { studentId: string }) {
  const [contracts, reports] = await Promise.all([
    getContracts(studentId),
    getContractTrainingReports(studentId),
  ]);
  // 直近5件の契約のみを表示し、それより古い分はtraining-reports一覧ページへ誘導する
  // (contractsはstart_date降順のため先頭5件で足りる)
  return <TrainingReportCard studentId={studentId} contracts={contracts.slice(0, 5)} initialReports={reports} />;
}
