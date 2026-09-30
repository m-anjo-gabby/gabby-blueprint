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

// 各取得は cache() で1リクエスト内の1回にまとめる。page.tsx の先頭で preloadOverviewSections() から
// 取得を開始し、各カードの描画時には開始済みの取得の結果を使う（ヘッダー用の取得を待ってから
// カードの取得を始めると、両者の時間が直列に足されるため）。
// 契約一覧は Live Sessions / Training Reports の両カードで使う
const getContracts = cache(getStudentLiveSessionContracts);
const getShortfalls = cache(getStudentLiveSessionShortfalls);
const getLessonHistory = cache(getLessonSprintHistory);
const getAssignments = cache(getStudentDialogueAssignments);
const getAvailableContents = cache(getAvailableDialogueContents);
const getNotes = cache(getStudentNotes);
const getReports = cache(getContractTrainingReports);

/** Live Sessions カードの初期表示（初期選択の契約と、その契約のセッション一覧。契約一覧の取得に続けて取得する） */
const getInitialLiveSessions = cache(async (studentId: string) => {
  const contracts = await getContracts(studentId);
  // 現在有効な契約を優先し、無ければ直近の過去契約(contractsはstart_date降順)を初期選択とする
  const initialContract = contracts.find((c) => c.is_current) ?? contracts[0] ?? null;
  const initialSessions = initialContract ? await getStudentSessionsByTicket(studentId, initialContract.ticket_id) : [];
  return { contracts, initialContract, initialSessions };
});

const ignore = () => {};

/**
 * 全カードの取得を開始する（await しない。page.tsx でヘッダー用の取得より先に呼ぶ）。
 * 生徒が見つからずカードを描画しない場合に失敗が未処理として残らないよう、ここで受け止めておく
 * （カード側で await した場合は従来どおり失敗が伝わる）。
 */
export function preloadOverviewSections(studentId: string) {
  getInitialLiveSessions(studentId).catch(ignore);
  getShortfalls(studentId).catch(ignore);
  getLessonHistory(studentId).catch(ignore);
  getAssignments(studentId).catch(ignore);
  getAvailableContents(studentId).catch(ignore);
  getNotes(studentId).catch(ignore);
  getReports(studentId).catch(ignore);
}

export async function LiveSessionHistorySection({ studentId, profile }: { studentId: string; profile: StudentOverviewProfile }) {
  const [{ contracts, initialContract, initialSessions }, shortfalls] = await Promise.all([
    getInitialLiveSessions(studentId),
    getShortfalls(studentId),
  ]);

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
  const history = await getLessonHistory(studentId);
  return <LessonSprintCard studentId={studentId} history={history} />;
}

export async function DialoguePracticeSection({ studentId }: { studentId: string }) {
  const [assignments, availableContents] = await Promise.all([
    getAssignments(studentId),
    getAvailableContents(studentId),
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
  const notes = await getNotes(studentId);
  // 直近5件のみを表示し、それより古い分はcoach-notes一覧ページへ誘導する
  // (notesはinsert_date降順のため先頭5件で足りる)
  return <CoachNotesCard studentId={studentId} initialNotes={notes.slice(0, 5)} />;
}

export async function TrainingReportSection({ studentId }: { studentId: string }) {
  const [contracts, reports] = await Promise.all([
    getContracts(studentId),
    getReports(studentId),
  ]);
  // 直近5件の契約のみを表示し、それより古い分はtraining-reports一覧ページへ誘導する
  // (contractsはstart_date降順のため先頭5件で足りる)
  return <TrainingReportCard studentId={studentId} contracts={contracts.slice(0, 5)} initialReports={reports} />;
}
