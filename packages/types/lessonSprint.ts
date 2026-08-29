import { SprintAnswerType, SprintQuestion, SprintQuestionType } from './sprint';
import { CoachStudentErrorCode } from './coachStudent';
import { ContentMetadata } from './content';

/**
 * コーチ向け Lesson Sprint の問題1件あたりの実施履歴。
 * lesson_t_sprint.answered_history (JSONB) の要素型。
 */
export interface LessonSprintHistoryItem {
  question_id: string;
  group_id: string | null;
  seq_no: number;
  is_skipped: boolean;
  score: number | null; // 1(Pass) 〜 5(No Mistake)。スキップ時はnull
  highlighted_word_indices: number[]; // 解答文中でクリック/ハイライトされた単語のインデックス
}

/** コーチが教材（コンテンツ）を選択するための情報。セットアップ画面で種別/レベル選択肢を
 *  絞り込むため、メタデータ（sprint_type/has_level/supported_types）まで含めて1回で返す。 */
export interface LessonSprintContentSummary {
  content_id: string;
  content_name: string;
  metadata: ContentMetadata;
}

/** Lesson Sprint結果登録用の入力ペイロード */
export interface CreateLessonSprintResultInput {
  student_id: string;
  sprint_type: string;
  content_id: string;
  question_type: SprintQuestionType;
  answer_type: SprintAnswerType;
  difficulty_level: number;
  time_limit_sec: number;
  total_answered: number;
  total_evaluated: number;
  paused_duration_sec: number;
  session_note: string | null;
  history: LessonSprintHistoryItem[];
}

/** Student Overview画面のLesson Sprint履歴一覧に表示する簡易レコード（教材名を含む） */
export interface LessonSprintHistoryListItem {
  lesson_sprint_id: string;
  content_name: string;
  question_type: string;
  difficulty_level: number;
  total_answered: number;
  total_evaluated: number;
  average_score: number | null;
  insert_date: string;
}

/** lesson_t_sprint の1レコード */
export interface LessonSprintRecord {
  lesson_sprint_id: string;
  coach_id: string;
  student_id: string;
  sprint_type: string;
  content_id: string;
  question_type: string;
  answer_type: string;
  difficulty_level: number;
  time_limit_sec: number;
  total_answered: number;
  total_evaluated: number;
  paused_duration_sec: number;
  session_note: string | null;
  answered_history: LessonSprintHistoryItem[];
  insert_date: string;
  update_date: string;
}

/** 5段階評価の表示メタデータ（1=Pass 〜 5=No Mistake） */
export const LESSON_SPRINT_SCORE_META: Record<number, { label: string; color: string }> = {
  1: { label: 'Pass', color: '#EF4444' },
  2: { label: 'Fair', color: '#F97316' },
  3: { label: 'Good', color: '#F59E0B' },
  4: { label: 'Great', color: '#3B82F6' },
  5: { label: 'No Mistake', color: '#10B981' },
};

export const DEFAULT_LESSON_SPRINT_SCORE = 3;

export type GetLessonSprintContentsResult =
  | { success: true; contents: LessonSprintContentSummary[] }
  | { success: false; errorCode: CoachStudentErrorCode };

export type GetLessonSprintQuestionsResult =
  | { success: true; questions: SprintQuestion[] }
  | { success: false; errorCode: CoachStudentErrorCode };

export type CreateLessonSprintResultResponse =
  | { success: true; lesson_sprint_id: string }
  | { success: false; errorCode: CoachStudentErrorCode };

export type GetLessonSprintHistoryResult =
  | { success: true; records: LessonSprintHistoryListItem[] }
  | { success: false; errorCode: CoachStudentErrorCode };

export type GetLessonSprintDetailResult =
  | { success: true; record: LessonSprintRecord; questions: SprintQuestion[] }
  | { success: false; errorCode: CoachStudentErrorCode };
