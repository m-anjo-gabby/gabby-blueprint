// src/types/word.ts

export interface PhraseRecord {
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
  phrases: PhraseRecord[];
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