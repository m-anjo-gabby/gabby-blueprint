import type { SprintQuestion } from '@gabby/types/sprint';
import type { SprintHistoryItem } from '@/actions/sprintAction';

/** 結果画面で表示するスプリント1回分の実施記録 */
export interface SprintResultScore {
  self_sprint_id: string;
  sprint_type: string;
  content_id: string;
  question_type: string;
  answer_type: string;
  difficulty_level: number;
  time_limit_sec: number;
  total_answered: number;
  created_at: string;
  answered_history: SprintHistoryItem[];
  totalAssessmentCount: number;
  averageAssessmentScore: number;
}

/** 結果画面（実施直後の没入画面・履歴からのシェル画面）で共通に使う表示データ */
export interface SprintResultData {
  scoreData: SprintResultScore;
  questions: SprintQuestion[];
  courseTitle: string;
}
