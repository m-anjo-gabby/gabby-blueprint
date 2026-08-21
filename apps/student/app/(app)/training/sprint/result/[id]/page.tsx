import { notFound } from 'next/navigation';
import { getSprintResultAction } from '@/actions/sprintAction';
import { getSprintTitle } from '@gabby/lib';
import { SprintResult } from './_components/SprintResult';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function SprintResultPage({ params }: PageProps) {
  const { id } = await params;

  const res = await getSprintResultAction(id);

  if (!res.success || !res.data) {
    return notFound();
  }

  // Server Action が計算してくれた追加フィールド（hasLevel は com_m_contents を1クエリでJOINして解決済み）を取り出す
  const { scoreRecord, questions, totalAssessmentCount, averageAssessmentScore, hasLevel } = res.data;

  const courseTitle = getSprintTitle(
    scoreRecord.question_type || '0', 
    Number(scoreRecord.difficulty_level),
    hasLevel
  );

  // DBの answered_history は文字列またはJSONオブジェクトなので、
  // フロントに一貫した型で渡すためにパースを考慮します
  const parsedHistory = typeof scoreRecord.answered_history === 'string'
    ? JSON.parse(scoreRecord.answered_history)
    : scoreRecord.answered_history;

  return (
    <SprintResult
      scoreData={{
        self_sprint_id: scoreRecord.self_sprint_id,
        sprint_type: scoreRecord.sprint_type,
        content_id: scoreRecord.content_id,
        question_type: scoreRecord.question_type,
        answer_type: scoreRecord.answer_type,
        difficulty_level: scoreRecord.difficulty_level,
        time_limit_sec: scoreRecord.time_limit_sec,
        total_answered: scoreRecord.total_answered,
        created_at: scoreRecord.insert_date,
        
        // 💡 🆕 結果画面コンポーネントが求める拡張データをここでしっかりマッピングする
        answered_history: parsedHistory || [],
        totalAssessmentCount: totalAssessmentCount,
        averageAssessmentScore: averageAssessmentScore
      }} 
      questions={questions}
      courseTitle={courseTitle}
    />
  );
}