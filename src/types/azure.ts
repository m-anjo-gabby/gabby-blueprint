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
 * 汎用TTS作成用の拡張ボイスリスト (全14名)
 * * [属性解説]
 * - origin: 出身国 (US, CA, UK)。コーチへの伝わりやすさを考慮しイギリスはUKと表記。
 * - tagline: セレクトボックス内での簡易表示用。
 * - description: 選択後の詳細エリアに表示する詳細解説。
 * - isRecommended: Azureの機能（Style等）への対応が最も厚い鉄板モデル。
 * - isPopular: 音質が極めて自然、または特定の用途で支持が高いモデル。
 */
export const AZURE_GENERAL_VOICES = [
  // --- US: Standard (万能・基本ペア) ---
  { 
    id: 'en-US-JennyNeural', label: 'Jenny', gender: 'Female', origin: 'US',
    tagline: 'Versatile & Friendly',
    description: 'Natural, warm, and highly versatile. Best for general instructions and daily conversation.',
    isRecommended: true, isPopular: true 
  },
  { 
    id: 'en-US-GuyNeural', label: 'Guy', gender: 'Male', origin: 'US',
    tagline: 'Trustworthy & Balanced',
    description: 'Trustworthy and balanced. Ideal for a wide range of content from tutorials to narration.',
    isRecommended: true, isPopular: true 
  },

  // --- CA: Canada (カナダ・担当コーチのネイティブアクセント) ---
  { 
    id: 'en-CA-ClaraNeural', label: 'Clara', gender: 'Female', origin: 'CA',
    tagline: 'Clear Canadian Accent',
    description: 'Clean and natural Canadian English. Great for educational content and clear coaching.',
    isRecommended: false, isPopular: false 
  },
  { 
    id: 'en-CA-LiamNeural', label: 'Liam', gender: 'Male', origin: 'CA',
    tagline: 'Polite & Natural CA',
    description: 'Standard Canadian male voice. Sounds friendly, professional, and very easy to follow.',
    isRecommended: false, isPopular: false 
  },

  // --- UK: United Kingdom (イギリス・伝統的で上品) ---
  { 
    id: 'en-GB-SoniaNeural', label: 'Sonia', gender: 'Female', origin: 'UK',
    tagline: 'Elegant British English',
    description: 'Sophisticated and clear British accent. Perfect for high-quality narration and formal tone.',
    isRecommended: false, isPopular: false 
  },
  { 
    id: 'en-GB-RyanNeural', label: 'Ryan', gender: 'Male', origin: 'UK',
    tagline: 'Professional & Calm UK',
    description: 'Warm and intellectual British male voice. Ideal for storytelling and professional guidance.',
    isRecommended: false, isPopular: false 
  },

  // --- US: High-Fidelity (最新・高品質) ---
  { 
    id: 'en-US-AvaNeural', label: 'Ava', gender: 'Female', origin: 'US',
    tagline: 'Bright & Engaging',
    description: 'High-fidelity and expressive. Sounds bright and engaging, great for marketing and storytelling.',
    isRecommended: false, isPopular: true 
  },
  { 
    id: 'en-US-AndrewNeural', label: 'Andrew', gender: 'Male', origin: 'US',
    tagline: 'Warm & Studio-Quality',
    description: 'One of the newest high-fidelity voices. Warm, studio-quality sound for premium content.',
    isRecommended: false, isPopular: true 
  },

  // --- US: Professional (ビジネス・フォーマル) ---
  { 
    id: 'en-US-AriaNeural', label: 'Aria', gender: 'Female', origin: 'US',
    tagline: 'Formal & Professional',
    description: 'Polished and professional. Perfect for news broadcasting, documentaries, and formal presentations.',
    isRecommended: false, isPopular: true 
  },
  { 
    id: 'en-US-SteffanNeural', label: 'Steffan', gender: 'Male', origin: 'US',
    tagline: 'Clear & Articulate',
    description: 'Clear, articulate, and professional. Best for corporate training and formal announcements.',
    isRecommended: false, isPopular: false 
  },

  // --- US: Narrative (物語・感情豊か) ---
  { 
    id: 'en-US-EmmaNeural', label: 'Emma', gender: 'Female', origin: 'US',
    tagline: 'Soft & Narrative',
    description: 'Soft and gentle. Excellent for creative writing, bedtime stories, and emotional messages.',
    isRecommended: false, isPopular: false 
  },
  { 
    id: 'en-US-ChristopherNeural', label: 'Christopher', gender: 'Male', origin: 'US',
    tagline: 'Deep & Resonant',
    description: 'Deep and resonant. Provides a strong narrative presence for audiobooks and dramatic scripts.',
    isRecommended: false, isPopular: false 
  },

  // --- US: Casual (若々しい・親しみ) ---
  { 
    id: 'en-US-SaraNeural', label: 'Sara', gender: 'Female', origin: 'US',
    tagline: 'Cheerful & Supportive',
    description: 'Cheerful and helpful. Optimized for customer support, AI assistants, and friendly interactions.',
    isRecommended: false, isPopular: false 
  },
  { 
    id: 'en-US-BrianNeural', label: 'Brian', gender: 'Male', origin: 'US',
    tagline: 'Youthful & Modern',
    description: 'Youthful and energetic. Good for casual content, social media, and modern tech-focused apps.',
    isRecommended: false, isPopular: false 
  },
] as const;

export type AzureGeneralVoiceId = (typeof AZURE_GENERAL_VOICES)[number]['id'];

/**
 * ----------------------------------------------
 * 型定義
 * ----------------------------------------------
 */
export type AzureVoice = typeof AZURE_VOICES[number]['id'];
export type AzureStyle = typeof AZURE_STYLES[number]['id'];
export type AzureGeneralVoice = (typeof AZURE_GENERAL_VOICES)[number]['id'];

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