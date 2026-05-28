import { notFound } from 'next/navigation';
import { getSprintResultAction } from '@/actions/sprintAction'; // 💡 アクションの実際のパスに合わせて調整してください
import { getSprintTitle } from '@gabby/lib';
import { SprintResult } from './_components/SprintResult';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function SprintResultPage({ params }: PageProps) {
  const { id } = await params;

  // 🚀 定義していただいた Server Action を呼び出してセッション情報を一元復元
  const res = await getSprintResultAction(id);

  // エラーまたはデータがない場合は404へ安全にフォールバック
  if (!res.success || !res.data) {
    return notFound();
  }

  const { scoreRecord, questions } = res.data;

  // コース名のマッピング
  const courseTitle = getSprintTitle(
    scoreRecord.question_type || '0', 
    Number(scoreRecord.difficulty_level)
  );

  return (
    <SprintResult
      scoreData={{
        self_sprint_id: scoreRecord.self_sprint_id,
        question_type: scoreRecord.question_type,
        answer_type: scoreRecord.answer_type, // 🆕 セッション共通のYes/No縛り
        difficulty_level: scoreRecord.difficulty_level,
        time_limit_sec: scoreRecord.time_limit_sec,
        total_answered: scoreRecord.total_answered,
        created_at: scoreRecord.insert_date,   // 🆕 DDLのinsert_dateにマッピング
      }} 
      questions={questions}
      courseTitle={courseTitle}
    />
  );
}