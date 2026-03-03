// --- 型定義 ---
interface AssessmentWord {
  Word: string;
  PronunciationAssessment: {
    ErrorType: "None" | "Mispronunciation" | "Omission" | "Insertion";
  };
  Phonemes: {
    Phoneme: string;
    PronunciationAssessment: { AccuracyScore: number };
  }[];
}

interface AssessmentJson {
  NBest: {
    Words: AssessmentWord[];
  }[];
}