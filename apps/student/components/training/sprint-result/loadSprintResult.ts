import { getSprintResultAction, type SprintHistoryItem } from '@/actions/sprintAction';
import { getSprintTitle } from '@gabby/lib';
import type { SprintResultData } from './types';

/**
 * スプリント結果画面の表示データを取得する（Server Component から呼ぶ）。
 * 本人の結果が取得できない場合は null を返すので、呼び出し側で notFound() にする。
 */
export async function loadSprintResult(selfSprintId: string): Promise<SprintResultData | null> {
  const res = await getSprintResultAction(selfSprintId);
  if (!res.success || !res.data) return null;

  // 発話数・平均スコア・hasLevel は Server Action 側で計算済み
  const { scoreRecord, questions, totalAssessmentCount, averageAssessmentScore, hasLevel } = res.data;

  // DBの answered_history は文字列またはJSONオブジェクトのため、一貫した型に揃える
  const answeredHistory: SprintHistoryItem[] =
    typeof scoreRecord.answered_history === 'string'
      ? JSON.parse(scoreRecord.answered_history)
      : scoreRecord.answered_history ?? [];

  return {
    scoreData: {
      self_sprint_id: scoreRecord.self_sprint_id,
      sprint_type: scoreRecord.sprint_type,
      content_id: scoreRecord.content_id,
      question_type: scoreRecord.question_type,
      answer_type: scoreRecord.answer_type,
      difficulty_level: scoreRecord.difficulty_level,
      time_limit_sec: scoreRecord.time_limit_sec,
      total_answered: scoreRecord.total_answered,
      created_at: scoreRecord.insert_date,
      answered_history: answeredHistory,
      totalAssessmentCount,
      averageAssessmentScore,
    },
    questions,
    courseTitle: getSprintTitle(scoreRecord.question_type || '0', Number(scoreRecord.difficulty_level), hasLevel),
  };
}
