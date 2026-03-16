// src/types/word.ts

/**
 * ----------------------------------------------
 * 単語・フレーズ関連の型定義
 * ----------------------------------------------
 */

// 単語マスタ (com_m_word)
export interface WordRecord {
  word_id: string;
  content_id: string;
  word_en: string;
  word_ja: string;
  frequency_rank?: number;
  delete_flg: '0' | '1';
  insert_date: string;
  update_date: string;
}

// 出題例文マスタ (com_m_phrase)
export interface PhraseRecord {
  phrase_id: string;
  word_id: string;
  seq_no: number;
  phrase_type: number; // 1: S+V, 2: Adding...
  phrase_en: string;
  phrase_ja: string;
  audio_path: string | null;
  tts_ssml: string | null;
  tts_status: number; // 0:未生成, 1:完了, 2:要更新, 9:エラー
  last_tts_date: string | null;
  delete_flg: '0' | '1';
  insert_date: string;
  update_date: string;
}

export interface TrainingPhrase {
  phrase_id: string;
  phrase_en: string;
  phrase_ja: string;
  phrase_type: number;
  seq_no: number;
  is_favorite_initial: boolean;
}

export interface TrainingWord {
  word_id: string;
  word_en: string;
  word_ja: string;
  phrases: TrainingPhrase[];
}

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