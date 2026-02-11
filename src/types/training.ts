// src/types/training.ts

export interface PhraseRecord {
  phrase_id: string;
  phrase_en: string;
  phrase_ja: string;
  phrase_type: number;
  seq_no: number;
}

export interface TrainingWord {
  word_id: string;
  word_en: string;
  word_ja: string;
  phrases: PhraseRecord[];
}