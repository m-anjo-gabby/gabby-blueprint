// src/types/training.ts

export interface PhraseRecord {
  phrase_id: number;
  phrase_en: string;
  phrase_ja: string;
  phrase_type: number;
  seq_no: number;
}

export interface TrainingWord {
  word_id: number;
  word_en: string;
  word_ja: string;
  phrases: PhraseRecord[];
}