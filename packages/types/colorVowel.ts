// packages/types/colorVowel.ts

// -----------------------------------------------------------------------
// 定数・区分値 (品詞: Part of Speech)
// -----------------------------------------------------------------------
export const PART_OF_SPEECH_TYPES = {
  NOUN: 'NOUN',
  VERB: 'VERB',
  ADJECTIVE: 'ADJ',
  ADVERB: 'ADV',
  PRONOUN: 'PRON',
  PREPOSITION: 'PREP',
  CONJUNCTION: 'CONJ',
  INTERJECTION: 'INT',
  UNKNOWN: 'UNKNOWN',
} as const;

export type PartOfSpeechType = typeof PART_OF_SPEECH_TYPES[keyof typeof PART_OF_SPEECH_TYPES];

export const PART_OF_SPEECH_MAP: Record<PartOfSpeechType, string> = {
  [PART_OF_SPEECH_TYPES.NOUN]: '名詞',
  [PART_OF_SPEECH_TYPES.VERB]: '動詞',
  [PART_OF_SPEECH_TYPES.ADJECTIVE]: '形容詞',
  [PART_OF_SPEECH_TYPES.ADVERB]: '副詞',
  [PART_OF_SPEECH_TYPES.PRONOUN]: '代名詞',
  [PART_OF_SPEECH_TYPES.PREPOSITION]: '前置詞',
  [PART_OF_SPEECH_TYPES.CONJUNCTION]: '接続詞',
  [PART_OF_SPEECH_TYPES.INTERJECTION]: '感嘆詞',
  [PART_OF_SPEECH_TYPES.UNKNOWN]: 'その他',
};

export const getPartOfSpeechLabel = (type: string | null | undefined): string => {
  return PART_OF_SPEECH_MAP[type as PartOfSpeechType] ?? 'その他';
};

// -----------------------------------------------------------------------
// 定数・区分値 (Color Vowel カラーマッピング)
// -----------------------------------------------------------------------
export const COLOR_VOWEL_COLORS: Record<string, string> = {
  auburn_dog: '#822315',       // 濃いオーバーン
  black_cat: '#000000',        // 黒
  blue_moon: '#5DA2EE',        // 深い青
  brown_cow: '#674C43',        // 茶色
  cup_of_mustard: '#F5C444',   // マスタードイエロー
  gray_day: '#9D9D9D',         // グレー
  green_tea: '#66AC5B',        // 緑
  olive_sock: '#66661D',       // オリーブ
  orange_door: '#EC5220',      // オレンジ
  purple_shirt: '#8F31A9',     // 紫
  red_pepper: '#D23520',       // 赤
  rose_boat: '#DE6A92',        // ローズピンク
  silver_pin: '#D0D7DB',       // シルバーグレー
  turquoise_toy: '#74CDDD',    // ターコイズ
  white_tie: '#D1D5DB',        // 白タイ（境界線なので少しグレーがかった色にして視認性確保）
  wooden_hook: '#B9ABA5',      // ウッドブラウン
};

export const getColorVowelBorderColor = (cvId: string | null | undefined): string => {
  if (!cvId) return '#D1D5DB';
  return COLOR_VOWEL_COLORS[cvId] ?? '#D1D5DB';
};

// -----------------------------------------------------------------------
// com_m_color_vowel テーブル行型
// -----------------------------------------------------------------------
export interface ColorVowelRow {
  cv_id: string;
  cv_name: string;
  description: string;
  icon_path: string;
  audio_path: string;
  video_title: string | null;
  video_path: string | null;
  delete_flg: number; // 0: 有効, 1: 削除済み
  insert_date: string;
  update_date: string;
}

// -----------------------------------------------------------------------
// com_m_color_vowel_dictionary テーブル行型
// -----------------------------------------------------------------------
export interface ColorVowelDictionaryRow {
  dic_id: string;
  word_en: string;
  part_of_speech: string; // 品詞
  word_ja: string | null; // 日本語訳
  syllables: string; // 音節（ハイフン区切り）
  primary_stress_syllable: number;
  stress_vowel_spelling: string; // ストレス母音の綴り
  cv_id: string;
  phonetic_spelling: string | null;
  audio_path: string | null;
  tts_ssml: string | null;
  tts_ssml_mode: 'auto' | 'manual';
  tts_adjustments: Record<string, unknown> | null;
  tts_status: 0 | 1 | 2 | 9; // 0:未生成, 1:生成済, 2:要再生成, 9:エラー
  last_tts_date: string | null;
  status: 'live' | 'pending';
  delete_flg: number; // 0: 有効, 1: 削除済み
  insert_date: string;
  update_date: string;
}

// -----------------------------------------------------------------------
// Server Action & Client 返却型
// -----------------------------------------------------------------------
export interface ColorVowelDicResult {
  dicId: string;
  wordEn: string;
  partOfSpeech: string;
  wordJa: string | null;
  syllables: string;
  primaryStressSyllable: number;
  stressVowelSpelling: string;
  phoneticSpelling: string | null;
  wordAudioUrl: string | null;
  vowel: {
    cvId: string;
    cvName: string;
    description: string;
    vowelImageUrl: string;
    vowelAudioUrl: string | null;
  };
}