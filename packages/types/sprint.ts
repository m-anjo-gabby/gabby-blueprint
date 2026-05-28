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
export interface SprintTypeMetadata {
  label: string;
  value: SprintQuestionType;
  seq_no: number;
  dbKey: string;          // ユーザー進捗レコードのDBカラム名
  hasBasic: boolean;      // レベル0(Basic)が存在するかどうか
  maxLevel: number;       // 上限レベル (5 または 10)
}

/**
 * スプリント問題種別の画面表示用マスタ
 */
export const SPRINT_TYPES: Record<SprintQuestionType, SprintTypeMetadata> = {
  '0': { label: 'UG Speed', value: '0', seq_no: 1, dbKey: 'CTS_LEVEL_YN', hasBasic: true, maxLevel: 10 },
  '5': { label: 'UG Builders', value: '5', seq_no: 2, dbKey: 'CTS_LEVEL_UGBUILDERS', hasBasic: false, maxLevel: 5 },
  '4': { label: 'UG Structure', value: '4', seq_no: 3, dbKey: 'CTS_LEVEL_UGCV', hasBasic: true, maxLevel: 10 },
  '6': { label: 'UG Mastery', value: '6', seq_no: 4, dbKey: 'CTS_LEVEL_UGMASTERY', hasBasic: false, maxLevel: 5 },
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
 * 制限時間オプションの実体マスタデータ
 */
export const SPRINT_TIME_OPTIONS: Record<number, SprintTimeOption> = {
  60:  { value: 60,  label: '60s',  desc: 'クイックアタック', seq_no: 1 },
  90:  { value: 90,  label: '90s',  desc: 'スタンダード',   seq_no: 2 },
  120: { value: 120, label: '120s', desc: 'ディープラン',     seq_no: 3 },
  150: { value: 150, label: '150s', desc: 'インテンシブ',   seq_no: 4 },
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

export interface SprintQuestionResponse {
  success: boolean;
  data: SprintQuestion[] | null;
  error?: string;
}

/**
 * 各スプリント種別の説明（回答ルール・ヒント）
 */
export const SPRINT_NOTES: Record<SprintQuestionType, string> = {
  '0': 'すべての質問に「YES」か「NO」で答えてください。完全な文章で回答しましょう。',
  '4': '指示に従って、聞こえてくる文章を変換してください。',
  '5': '基本形の動詞と聞こえてくる語句を加えて、文法的に正しい文章を作りましょう。',
  '6': '聞こえてくる文について3つの質問をします。最初の2つは文の内容、3つ目は文に関連する質問です。完全な文章で回答しましょう。'
} as const;

/**
 * 種別×レベルの組み合わせによる出題テーママスタ
 */
export const SPRINT_THEMES: Record<string, string> = {
  "0_0": "現在形、現在進行形、過去形、未来形 (will, going to) + 主語 + 形容詞/目的語",
  "0_1": "現在形 (I am, she doesn't want) + 主語 + 形容詞/目的語",
  "0_2": "現在進行形 (I am going, she is running) + 主語 + 形容詞/目的語",
  "0_3": "過去形 (I went, she ate) + 主語 + 形容詞/目的語/動詞",
  "0_4": "未来形 (will, going to) + 主語 + 形容詞/目的語/動詞",
  "0_5": "現在完了形 (I have been, he has eaten) + 主語 + 目的語/副詞",
  "0_6": "現在形/現在進行形 (they are swimming, I do love) + 主語 + 目的語 (より複雑)",
  "0_7": "過去進行形/過去完了形 (they were going, he had been) + 主語 + 目的語/副詞",
  "0_8": "様々な未来時制 (未来進行形、be going to、未来完了形など) + 主語 + 目的語/副詞",
  "0_9": "過去形/過去進行形/過去完了形 + 現在完了形 + 主語 + 目的語 + 否定疑問文 (より複雑)",
  "0_10": "様々な動詞の時制 + 埋め込み節 + 否定疑問文 + TOEIC/TOEFL語彙",
  "5_1": "時制: 現在形 | 1〜3語の短い追加指示",
  "5_2": "時制: 現在形、過去形、未来形、現在進行形 | 1〜3語の短い追加指示",
  "5_3": "時制: これまでの全ての時制 | 1〜4語の短い追加指示句",
  "5_4": "時制: これまでの全ての時制 + 現在完了形 | 1〜5語の短い追加指示句",
  "5_5": "時制: これまでの全ての時制 + 現在完了進行形 | 1〜5語の短い追加指示句",
  "4_0": "現在形、現在進行形、現在完了形、過去形、未来形 (will, going to) | 定冠詞・不定冠詞、主格・目的格代名詞、三人称単数", // Basicを'0'としてマッピング
  "4_1": "現在形、現在進行形、現在完了形 | 定冠詞・不定冠詞、三人称単数-s",
  "4_2": "現在形、現在進行形、現在完了形 | 定冠詞・不定冠詞、直接目的語・間接目的語、三人称単数-s | 前置詞句",
  "4_3": "過去形、過去進行形 | 形容詞・副詞 | 前置詞句",
  "4_4": "過去形、過去進行形、過去完了形 | 形容詞、副詞・副詞句 (より複雑) | 前置詞句 (より複雑)",
  "4_5": "過去形、過去進行形、過去完了形 | 過去の“used to”, “have to”, “able to” | 能力・可能性の助動詞 (can, could, might, may)",
  "4_6": "未来形、未来進行形 | 未来の“going to”, “want to”, “able to” | 許可の助動詞 (can, could, may)",
  "4_7": "未来形、未来進行形、未来完了形 | 義務の助動詞 (must, have to, need to)",
  "4_8": "未来形、未来進行形、未来完了形、現在完了進行形 | 未来の“have to” | 助動詞“should” (助言、義務、可能性、期待)",
  "4_9": "全ての動詞の時制 | 全ての助動詞 | 第1・第2仮定法 | 過去の“going to”",
  "4_10": "全ての動詞の時制 | 全ての助動詞 | 第1・第2仮定法 | 不規則な疑問文の形式 | 一般的な慣用句 | 従属節",
  "6_1": "時制: 現在形、過去形、未来形、現在進行形 | 文の長さ: 4 - 10語",
  "6_2": "時制: 全ての時制 | 文の長さ: 5 - 10語",
  "6_3": "時制: 全ての時制 | 文の長さ: 6 - 12語",
  "6_4": "時制: 全ての時制 + 現在完了進行形 | 文の長さ: 6 - 14語",
  "6_5": "時制: 全ての時制 + 過去進行形 | 文の長さ: 6 - 15語",
  "6_6": "時制: 全ての時制 + 過去完了形 | 文の長さ: 7 - 17語",
  "6_7": "時制: 全ての時制 | 文の長さ: 9 - 17語",
  "6_8": "時制: 全ての時制 + 過去完了進行形、未来進行形、未来完了形 | 文の長さ: 9 - 17語",
  "6_9": "時制: 全ての時制 | 文の長さ: 任意の長さ",
  "6_10": "時制: 全ての時制 | 文の長さ: 任意の長さ"
} as const;