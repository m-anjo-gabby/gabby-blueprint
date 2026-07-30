// packages/types/colorVowel.ts

// -----------------------------------------------------------------------
// 定数・区分値 (品詞: Part of Speech)
// -----------------------------------------------------------------------
export const PART_OF_SPEECH_TYPES = {
  NOUN:         'NOUN',
  VERB:         'VERB',
  ADJECTIVE:    'ADJ',
  ADVERB:       'ADV',
  PRONOUN:      'PRON',
  PREPOSITION:  'PREP',
  CONJUNCTION:  'CONJ',
  ARTICLE:      'ART',
  INTERJECTION: 'INT',
  UNKNOWN:      'UNKNOWN',
} as const;

export type PartOfSpeechType = typeof PART_OF_SPEECH_TYPES[keyof typeof PART_OF_SPEECH_TYPES];

/**
 * 品詞の詳細情報
 * - label       : 日本語ラベル（生徒向け表示）
 * - adminLabel  : 英語ラベル（管理画面 Select 等）
 * - seqNo       : 表示順
 * - tailwindColor : 管理画面でのバッジ色（Tailwind クラス）
 */
export interface PartOfSpeechDetail {
  label: string;
  adminLabel: string;
  seqNo: number;
  tailwindColor: string;
}

export const PART_OF_SPEECH_MAP: Record<PartOfSpeechType, PartOfSpeechDetail> = {
  [PART_OF_SPEECH_TYPES.NOUN]:         { label: '名詞',   adminLabel: 'Noun（名詞）',        seqNo: 1,  tailwindColor: 'bg-blue-50 text-blue-700 border-blue-100' },
  [PART_OF_SPEECH_TYPES.VERB]:         { label: '動詞',   adminLabel: 'Verb（動詞）',        seqNo: 2,  tailwindColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  [PART_OF_SPEECH_TYPES.ADJECTIVE]:    { label: '形容詞', adminLabel: 'Adjective（形容詞）', seqNo: 3,  tailwindColor: 'bg-violet-50 text-violet-700 border-violet-100' },
  [PART_OF_SPEECH_TYPES.ADVERB]:       { label: '副詞',   adminLabel: 'Adverb（副詞）',      seqNo: 4,  tailwindColor: 'bg-amber-50 text-amber-700 border-amber-100' },
  [PART_OF_SPEECH_TYPES.PRONOUN]:      { label: '代名詞', adminLabel: 'Pronoun（代名詞）',   seqNo: 5,  tailwindColor: 'bg-orange-50 text-orange-700 border-orange-100' },
  [PART_OF_SPEECH_TYPES.PREPOSITION]:  { label: '前置詞', adminLabel: 'Preposition（前置詞）',seqNo: 6, tailwindColor: 'bg-rose-50 text-rose-700 border-rose-100' },
  [PART_OF_SPEECH_TYPES.CONJUNCTION]:  { label: '接続詞', adminLabel: 'Conjunction（接続詞）',seqNo: 7, tailwindColor: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
  [PART_OF_SPEECH_TYPES.ARTICLE]:      { label: '冠詞',   adminLabel: 'Article（冠詞）',     seqNo: 8,  tailwindColor: 'bg-pink-50 text-pink-700 border-pink-100' },
  [PART_OF_SPEECH_TYPES.INTERJECTION]: { label: '感嘆詞', adminLabel: 'Interjection（感嘆詞）',seqNo: 9,tailwindColor: 'bg-lime-50 text-lime-700 border-lime-100' },
  [PART_OF_SPEECH_TYPES.UNKNOWN]:      { label: 'その他', adminLabel: 'Other（その他）',     seqNo: 99, tailwindColor: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/** 日本語ラベルを返すヘルパー（生徒向け） */
export const getPartOfSpeechLabel = (type: string | null | undefined): string => {
  return PART_OF_SPEECH_MAP[type as PartOfSpeechType]?.label ?? 'その他';
};

/** 管理画面用英語ラベルを返すヘルパー */
export const getPartOfSpeechAdminLabel = (type: string | null | undefined): string => {
  return PART_OF_SPEECH_MAP[type as PartOfSpeechType]?.adminLabel ?? 'Other（その他）';
};

/** 表示順を返すヘルパー（ソート用） */
export const getPartOfSpeechSeqNo = (type: string | null | undefined): number => {
  return PART_OF_SPEECH_MAP[type as PartOfSpeechType]?.seqNo ?? 99;
};

/** 管理画面バッジ用 Tailwind クラスを返すヘルパー */
export const getPartOfSpeechTailwindColor = (type: string | null | undefined): string => {
  return PART_OF_SPEECH_MAP[type as PartOfSpeechType]?.tailwindColor
    ?? 'bg-slate-100 text-slate-600 border-slate-200';
};

/**
 * Select コンポーネント用オプションリスト（seqNo 順）
 * adminLabel をラベル、PART_OF_SPEECH_TYPES の値を value として使用
 */
export const PART_OF_SPEECH_OPTIONS = (
  Object.entries(PART_OF_SPEECH_MAP) as [PartOfSpeechType, PartOfSpeechDetail][]
)
  .sort((a, b) => a[1].seqNo - b[1].seqNo)
  .map(([value, detail]) => ({ value, label: detail.adminLabel }));

// -----------------------------------------------------------------------
// 定数・区分値 (Color Vowel カラーマッピング)
// -----------------------------------------------------------------------
export const COLOR_VOWEL_COLORS: Record<string, string> = {
  auburn_dog:      '#822315',  // 濃いオーバーン
  black_cat:       '#000000',  // 黒
  blue_moon:       '#5DA2EE',  // 深い青
  brown_cow:       '#674C43',  // 茶色
  cup_of_mustard:  '#F5C444',  // マスタードイエロー
  gray_day:        '#9D9D9D',  // グレー
  green_tea:       '#66AC5B',  // 緑
  olive_sock:      '#66661D',  // オリーブ
  orange_door:     '#EC5220',  // オレンジ
  purple_shirt:    '#8F31A9',  // 紫
  red_pepper:      '#D23520',  // 赤
  rose_boat:       '#DE6A92',  // ローズピンク
  silver_pin:      '#D0D7DB',  // シルバーグレー
  turquoise_toy:   '#74CDDD',  // ターコイズ
  white_tie:       '#D1D5DB',  // 白タイ（境界線なので少しグレーがかった色にして視認性確保）
  wooden_hook:     '#B9ABA5',  // ウッドブラウン
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
// 管理画面・生徒側で共通して使用する DB スキーマ対応型
// -----------------------------------------------------------------------
export interface ColorVowelDictionaryRow {
  word_en: string;
  part_of_speech: PartOfSpeechType | string; // DB値は PartOfSpeechType の value
  word_ja: string | null;
  syllables: string | null;
  primary_stress_syllable: number | null;
  stress_vowel_spelling: string | null;
  cv_id: string | null;
  phonetic_spelling: string | null;
  audio_path: string | null;
  tts_ssml: string | null;
  tts_ssml_mode: 'auto' | 'manual' | null;
  tts_adjustments: Record<string, unknown> | null;
  tts_status: 0 | 1 | 2 | 9; // 0:未生成, 1:生成済, 2:要再生成, 9:エラー
  last_tts_date: string | null;
  status: 'live' | 'pending';
  delete_flg: number; // 0: 有効, 1: 削除済み
  insert_date: string | null;
  update_date: string | null;
}

// -----------------------------------------------------------------------
// Server Action & Client 返却型（生徒向けルックアップ結果）
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