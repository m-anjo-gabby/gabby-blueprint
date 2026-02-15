// src/types/training.ts

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

export interface TrainingResponse {
  words: TrainingWord[];
  corpusName: string;
}

export interface FavoritePhraseRecord {
  favorite_id: string;
  phrase_id: string;
  phrase_en: string;
  phrase_ja: string;
  word_en: string;
  corpus_id: string;   // コーパス切替に必要
  corpus_name: string; // タブに表示する名前に必要
  insert_date: string;
}

/**
 * Supabaseから返ってくる生のデータ構造 (TypeScript用)
 */
export type RawFavoriteResponse = {
  favorite_id: string;
  phrase_id: string;
  insert_date: string;
  com_m_phrase: {
    phrase_en: string;
    phrase_ja: string;
    com_m_word: {
      word_en: string;
      com_m_corpus: {
        corpus_id: string;
        corpus_name: string;
      };
    };
  };
};