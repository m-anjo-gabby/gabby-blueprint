/**
 * ----------------------------------------------
 * 定数・区分値
 * ----------------------------------------------
 */

// 公開ステータス (Word / Phrase 共通)
export const WORD_STATUS = {
  live: { label: '公開中', value: 'live', color: 'emerald' },
  pending: { label: '準備中', value: 'pending', color: 'slate' },
} as const;

// TTS生成ステータス
export const TTS_STATUS = {
  0: { label: '未生成', value: 0, color: 'slate' },
  1: { label: '生成済', value: 1, color: 'emerald' },
  2: { label: '要更新', value: 2, color: 'amber' },
  9: { label: 'エラー', value: 9, color: 'rose' },
} as const;

// フレーズ種別 (拡張性を持たせて定義)
export const PHRASE_TYPES = {
  1: { label: 'Use a Collocation', value: 1, description: '基本語順の習得' },
  2: { label: 'Build a Sentence', value: 2, description: '文章への拡張' },
  3: { label: 'Use It at Work', value: 3, description: '実務シーンへの適用' },
  4: { label: 'Expand the Sentence', value: 3, description: '詳細情報の付加' },
  5: { label: 'Variation', value: 3, description: '時制・表現のバリエーション' },
} as const;

/**
 * ----------------------------------------------
 * 型定義
 * ----------------------------------------------
 */

export type WordStatus = keyof typeof WORD_STATUS;
export type TtsStatus = keyof typeof TTS_STATUS;
export type PhraseType = keyof typeof PHRASE_TYPES;

// DBレコード型 (com_m_word)
export interface WordRecord {
  word_id: string;
  content_id: string;
  word_en: string;
  word_ja: string;
  frequency_rank: number | null;
  status: WordStatus;
  insert_date: string;
  update_date: string;
}

// DBレコード型 (com_m_phrase)
export interface PhraseRecord {
  phrase_id: string;
  word_id: string;
  seq_no: number;
  phrase_type: PhraseType;
  phrase_en: string;
  phrase_ja: string;
  audio_path: string | null;
  tts_ssml: string | null;
  tts_ssml_mode: 'auto' | 'manual';
  tts_adjustments?: WordAdjustment[];
  tts_status: TtsStatus;
  last_tts_date: string | null;
  status: WordStatus;
  insert_date: string;
  update_date: string;
}

// TTS用の全体・単語ごとのカスタマイズ状態をまとめた型
export interface TTSAdjustmentData {
  settings: {
    voice: string;
    style: string;
    rate: number;
    pitch: number;
  };
  words: WordAdjustment[];
}

// TTS用の単語ごとのカスタマイズ状態
export interface WordAdjustment {
  id: string;
  text: string;
  fullText: string;
  emphasis: boolean;
  emphasisLevel: 'reduced' | 'moderate' | 'strong';
  breakAfter: boolean;
  breakDuration: number;
  ipa: string;
}

/**
 * ----------------------------------------------
 * 生徒用・UI用拡張型 (Inheritance Base)
 * ----------------------------------------------
 */

/**
 * UI表示用のフレーズ共通型
 * PhraseRecord を継承し、お気に入り状態やリレーション情報を付加
 */
export interface PhraseItem extends PhraseRecord {
  is_favorite: boolean;      // お気に入り状態 (旧 is_favorite_initial)
  word_en?: string;          // 単語帳やリスト表示用
  content_id?: string;       // コンテンツ切替用
  content_name?: string;     // タブやラベル表示用
  favorite_id?: string;      // お気に入り削除Actionに必要
}

/**
 * 単語帳ドリル機能用 (Training)
 * WordRecord を継承し、ネストされたフレーズを UI用の PhraseItem に差し替え
 */
export interface TrainingWord extends WordRecord {
  phrases: PhraseItem[];
}

/**
 * ドリル機能のレスポンス型
 */
export interface TrainingWordResponse {
  words: TrainingWord[];
  contentName: string;
}

/**
 * お気に入り一覧用の型定義
 * 基本的に PhraseItem と同じだが、お気に入り画面では favorite_id が必須
 */
export interface FavoritePhraseItem extends PhraseItem {
  favorite_id: string;
  insert_date: string; // お気に入りに登録した日時
}

/**
 * サーバーアクションからの生レスポンス型 (Join結果)
 */
export type FavoriteResponse = {
  favorite_id: string;
  phrase_id: string;
  insert_date: string;
  com_m_phrase: {
    phrase_en: string;
    phrase_ja: string;
    phrase_type: PhraseType;
    seq_no: number;
    status: WordStatus;
    tts_status: TtsStatus;
    com_m_word: {
      word_en: string;
      com_m_contents: {
        content_id: string;
        content_name: string;
      };
    };
  };
};