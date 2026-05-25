/**
 * スプリント問題種別
 * '0': Speed, '4': Structure, '5': Builders, '6': Mastery
 */
export type SprintQuestionType = '0' | '4' | '5' | '6';

/**
 * Azure TTS 自動生成モード
 */
export type TtsSsmlMode = 'auto' | 'manual';

/**
 * スプリント問題マスタ（com_m_sprint_questions）エンティティ
 * データベースのカラム名（スネークケース）を完全に維持
 */
export interface SprintQuestion {
  question_id: string; // UUID
  question_type: SprintQuestionType;
  difficulty_level: number;
  group_id: string | null; // UUID (Speedの場合はnull)
  seq_no: number;

  // ① ステートメント（親文）セクション
  statement: string | null;
  statement_voice: string | null;
  statement_tts_ssml: string | null;
  statement_tts_ssml_mode: TtsSsmlMode;
  statement_tts_adjustments: any | null;
  statement_tts_status: number;

  // ② クエスチョン（問い・指示）セクション
  question: string;
  question_voice: string | null;
  question_tts_ssml: string | null;
  question_tts_ssml_mode: TtsSsmlMode;
  question_tts_adjustments: any | null;
  question_tts_status: number;

  // ③ 解答（YES・通常正解文）セクション
  answer_sentence_yes: string;
  answer_sentence_yes_voice: string | null;
  answer_sentence_yes_tts_ssml: string | null;
  answer_sentence_yes_tts_ssml_mode: TtsSsmlMode;
  answer_sentence_yes_tts_adjustments: any | null;
  answer_sentence_yes_tts_status: number;

  // ④ 解答（NO・否定文 ※Speed専用）セクション
  answer_sentence_no: string | null;
  answer_sentence_no_voice: string | null;
  answer_sentence_no_tts_ssml: string | null;
  answer_sentence_no_tts_ssml_mode: TtsSsmlMode;
  answer_sentence_no_tts_adjustments: any | null;
  answer_sentence_no_tts_status: number;

  // 管理・移行・システム共通カラム
  last_tts_date: string | null;
  legacy_question_id: number | null;
  legacy_group_id: number | null;
  delete_flg: string;
  insert_date: string;
  update_date: string;
}

/**
 * アクションレスポンスラッパーの型
 * wordAction.tsの返却形式(TrainingWordResponse等)に合わせた標準構造
 */
export interface SprintQuestionResponse {
  success: boolean;
  data: SprintQuestion[] | null;
  error?: string;
}