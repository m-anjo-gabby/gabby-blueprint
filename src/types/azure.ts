// src/types/azure.ts

/**
 * ----------------------------------------------
 * 定数・区分値
 * ----------------------------------------------
 */
export const AZURE_VOICES = [
  { id: 'en-US-JennyNeural', label: 'Jenny (Female)', gender: 'Female' },
  { id: 'en-US-GuyNeural', label: 'Guy (Male)', gender: 'Male' },
  { id: 'en-US-AriaNeural', label: 'Aria (Formal)', gender: 'Female' },
] as const;

export const AZURE_STYLES = [
  { id: 'friendly', label: 'Friendly' },
  { id: 'cheerful', label: 'Cheerful' },
  { id: 'excited', label: 'Excited' },
  { id: 'shouting', label: 'Shouting' },
  { id: 'whispering', label: 'Whispering' },
] as const;

/**
 * ----------------------------------------------
 * 型定義
 * ----------------------------------------------
 */
export type AzureVoice = typeof AZURE_VOICES[number]['id'];
export type AzureStyle = typeof AZURE_STYLES[number]['id'];

// --- 型定義 ---
export interface AssessmentWord {
  Word: string;
  PronunciationAssessment: {
    ErrorType: "None" | "Mispronunciation" | "Omission" | "Insertion";
  };
  Phonemes: {
    Phoneme: string;
    PronunciationAssessment: { AccuracyScore: number };
  }[];
}

export interface AssessmentJson {
  NBest: {
    Words: AssessmentWord[];
  }[];
}