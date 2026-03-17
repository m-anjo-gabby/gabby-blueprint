// src/types/word.ts

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
  1: { label: 'S + V', value: 1, description: '基本文型' },
  2: { label: 'Adding info', value: 2, description: '情報追加' },
  3: { label: 'Variation', value: 3, description: '言い換え' },
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
  status: WordStatus; // status に変更
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
  status: WordStatus; // status に変更
  insert_date: string;
  update_date: string;
}

// TTS用の単語ごとのカスタマイズ状態
export interface WordAdjustment {
  id: string; // インデックスを含む一意のID
  text: string; // 記号を除いた純粋なテキスト
  fullText: string; // 記号込みの表示用テキスト
  emphasis: boolean;
  emphasisLevel: 'reduced' | 'moderate' | 'strong'; // 強調レベル
  breakAfter: boolean;
  breakDuration: number; // ポーズミリ秒
  ipa: string;
}

// --- 既存の Training 関連は継承しつつ status 等を反映 ---
export interface TrainingPhrase {
  phrase_id: string;
  phrase_en: string;
  phrase_ja: string;
  phrase_type: PhraseType;
  seq_no: number;
  is_favorite_initial: boolean;
  status: WordStatus; // 追加
  tts_status: TtsStatus; // 追加
}

export interface TrainingWord {
  word_id: string;
  word_en: string;
  word_ja: string;
  status: WordStatus;
  phrases: TrainingPhrase[];
}

// 整理されたレスポンス型
export interface TrainingWordResponse {
  words: TrainingWord[];
  contentName: string;
}

export interface FavoritePhraseRecord {
  favorite_id: string;
  phrase_id: string;
  phrase_en: string;
  phrase_ja: string;
  word_en: string;
  content_id: string;   // コンテンツ切替に必要
  content_name: string; // タブに表示する名前に必要
  insert_date: string;
}

export type FavoriteResponse = {
  favorite_id: string;
  phrase_id: string;
  insert_date: string;
  com_m_phrase: {
    phrase_en: string;
    phrase_ja: string;
    com_m_word: {
      word_en: string;
      com_m_contents: {
        content_id: string;
        content_name: string;
      };
    };
  };
};