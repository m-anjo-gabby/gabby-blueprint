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

export interface FavoritePhraseRecord {
  favorite_id: string;
  phrase_id: string;
  phrase_en: string;
  phrase_ja: string;
  word_en: string; // どの単語のフレーズか分かると親切
  insert_date: string;
}