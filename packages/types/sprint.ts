/**
 * スプリント種別
 * '0':汎用スプリント, '1':コーパススプリント
 */
export type SprintType = '0' | '1';

/**
 * スプリント種別定義（汎用 / コーパス）のメタデータ定義
 */
export interface SprintTypeMetadata {
  label: string;
  value: SprintType;
}

/**
 * スプリント種別マスタデータ
 */
export const SPRINT_TYPES: Record<SprintType, SprintTypeMetadata> = {
  '0': { label: '汎用スプリント', value: '0' },
  '1': { label: 'コーパススプリント', value: '1' },
} as const;

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
 * スプリント解答タイプ（Speed用の分岐および結果管理用）
 * '0': YES回答モード（Speed:YES、または通常種別）
 * '1': NO回答モード（Speed:NO）
 */
export type SprintAnswerType = '0' | '1';

/**
 * 各スプリント種別のメタデータ定義（レベルマップ内包型）
 */
export interface QuestionTypeMetadata {
  label: string;
  value: SprintQuestionType;
  seq_no: number;
  dbKey: string;      // ユーザー進捗レコードのDBカラム名
  hasBasic: boolean;      // レベル0(Basic)が存在するかどうか
  minLevel: number;       // 最小レベル (0 または 1)
  maxLevel: number;       // 上限レベル (5 または 10)
}

/**
 * スプリント問題種別の画面表示用マスタ
 */
export const QUESTION_TYPES: Record<SprintQuestionType, QuestionTypeMetadata> = {
  '0': { label: 'UG Speed', value: '0', seq_no: 1, dbKey: 'level_speed', hasBasic: true, minLevel: 0, maxLevel: 10 },
  '5': { label: 'UG Builders', value: '5', seq_no: 2, dbKey: 'level_builders', hasBasic: false, minLevel: 1, maxLevel: 5 },
  '4': { label: 'UG Structure', value: '4', seq_no: 3, dbKey: 'level_structure', hasBasic: true, minLevel: 0, maxLevel: 10 },
  '6': { label: 'UG Mastery', value: '6', seq_no: 4, dbKey: 'level_mastery', hasBasic: false, minLevel: 1, maxLevel: 5 },
} as const;

/**
 * スプリント制限時間オプションの型定義
 */
export interface SprintTimeOption {
  value: number;       // 秒数 (60, 90, 120, 150)
  label: string;       // 画面表示用 (例: '60s')
  desc: string;        // サブテキスト
  seq_no: number;      // 表示順制御用
}

/**
 * 制限時間のデフォルト値を指定するマスタキー
 * 検証時や仕様変更時は、このキーの数値を変更するだけで一括追従します
 */
export const DEFAULT_SPRINT_TIME_KEY = 2 as const; // 2 = スダンダード(90s)

/**
 * 制限時間オプションの実体マスタデータ (キーは連番)
 */
export const SPRINT_TIME_OPTIONS: Record<number, SprintTimeOption> = {
  1: { value: 20,  label: '20s',  desc: 'クイックアタック', seq_no: 1 },
  2: { value: 90,  label: '90s',  desc: 'スタンダード',     seq_no: 2 },
  3: { value: 120, label: '120s', desc: 'ディープラン',     seq_no: 3 },
  4: { value: 150, label: '150s', desc: 'インテンシブ',     seq_no: 4 },
} as const;

/**
 * 起動ボタンからプレイヤーへ引き渡される
 * 確定済みトレーニング設定の構造
 */
export interface SprintConfig {
  mode: 'drill' | 'sprint';
  questionType: SprintQuestionType;
  level: string;
  timeLimitSec: number; // スプリント時は秒数(60, 90...)、ドリル時は9999などのダミー
}

export const DRILL_TIMING = {
  thinkingTime: 2000,   // 問いのあとの沈黙
  nextCardDelay: 2000,  // 解答が終わって次へ行くまでの余韻
  audioGap: 200,        // 基本文と問いの間の隙間
};

/**
 * スプリント問題マスタ（com_m_sprint_questions）エンティティ
 */
export interface SprintQuestion {
  question_id: string; // UUID
  content_id: string;  // UUID
  sprint_type: string; // 0:汎用スプリント, 1:コーパススプリント
  question_type: SprintQuestionType;
  difficulty_level: number;
  group_id: string | null; // UUID (Speedの場合はnull)
  seq_no: number;

  // ① ステートメント（親文）セクション
  statement_en: string | null;
  statement_ja: string | null;
  statement_voice: string | null;
  statement_tts_ssml: string | null;
  statement_tts_ssml_mode: TtsSsmlMode;
  statement_tts_adjustments: any | null;
  statement_tts_status: number;

  // ② クエスチョン（問い・指示）セクション
  question_en: string;
  question_ja: string | null;
  question_voice: string | null;
  question_tts_ssml: string | null;
  question_tts_ssml_mode: TtsSsmlMode;
  question_tts_adjustments: any | null;
  question_tts_status: number;

  // ③ 解答（YES・通常正解文）セクション
  answer_sentence_yes_en: string;
  answer_sentence_yes_ja: string | null;
  answer_sentence_yes_voice: string | null;
  answer_sentence_yes_tts_ssml: string | null;
  answer_sentence_yes_tts_ssml_mode: TtsSsmlMode;
  answer_sentence_yes_tts_adjustments: any | null;
  answer_sentence_yes_tts_status: number;

  // ④ 解答（NO・否定文 ※Speed専用）セクション
  answer_sentence_no_en: string | null;
  answer_sentence_no_ja: string | null;
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

export interface SprintQuestionResponse {
  success: boolean;
  data: SprintQuestion[] | null;
  error?: string;
}
