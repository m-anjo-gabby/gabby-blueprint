// CV辞書 一括登録の行検証・キー正規化（クライアントのプレビューとServer Actionの双方で使用）
import { PART_OF_SPEECH_TYPES, COLOR_VOWEL_COLORS } from '@gabby/types/colorVowel';

// ============================================================
// 定数
// ============================================================

export const CV_IMPORT_REQUIRED_HEADERS = [
  'word_en',
  'part_of_speech',
  'word_ja',
  'syllables',
  'primary_stress_syllable',
  'stress_vowel_spelling',
  'cv_id',
] as const;

export const CV_IMPORT_OPTIONAL_HEADERS = ['phonetic_spelling', 'lemma'] as const;

const VALID_POS: ReadonlySet<string> = new Set(Object.values(PART_OF_SPEECH_TYPES));
const VALID_CV_IDS: ReadonlySet<string> = new Set(Object.keys(COLOR_VOWEL_COLORS));

// ============================================================
// 型
// ============================================================

/** 取込モード: 新規のみ（既存はスキップ）/ 上書き */
export type CVImportMode = 'insertOnly' | 'overwrite';

export interface CVImportEntry {
  word_en: string;
  part_of_speech: string;
  word_ja: string;
  syllables: string;
  primary_stress_syllable: number;
  stress_vowel_spelling: string;
  cv_id: string;
  phonetic_spelling: string | null;
  /** 原形。null: 原形そのもの / undefined: 取込ファイルに lemma 列がない（既存値を変更しない） */
  lemma?: string | null;
}

export type CVImportRowErrorCode =
  | 'wordEnEmpty'
  | 'posEmpty'
  | 'posInvalid'
  | 'wordJaEmpty'
  | 'syllablesEmpty'
  | 'stressEmpty'
  | 'stressInvalid'
  | 'stressOutOfRange'
  | 'vowelSpellingEmpty'
  | 'vowelSpellingMismatch'
  | 'cvIdEmpty'
  | 'cvIdInvalid'
  | 'lemmaInvalid';

// ============================================================
// 関数
// ============================================================

/** 重複判定キー（生徒側の検索が ilike のため大文字小文字を区別しない） */
export const toCVEntryKey = (wordEn: string, partOfSpeech: string): string =>
  `${wordEn.trim().toLowerCase()}\t${partOfSpeech.trim()}`;

/** 原形の正規化（空欄・見出し語と同じ値は null） */
const normalizeLemma = (lemma: string | undefined, wordEn: string): string | null | undefined => {
  if (lemma === undefined) return undefined;
  const value = lemma.trim();
  return !value || value.toLowerCase() === wordEn.toLowerCase() ? null : value;
};

/** 生の行（文字列の辞書）を正規化 */
export const normalizeCVImportRow = (row: Record<string, string | undefined>): CVImportEntry => ({
  word_en: row.word_en?.trim() ?? '',
  part_of_speech: row.part_of_speech?.trim().toUpperCase() ?? '',
  word_ja: row.word_ja?.trim() ?? '',
  syllables: row.syllables?.trim() ?? '',
  primary_stress_syllable: Number(row.primary_stress_syllable?.trim() || NaN),
  stress_vowel_spelling: row.stress_vowel_spelling?.trim() ?? '',
  cv_id: row.cv_id?.trim() ?? '',
  phonetic_spelling: row.phonetic_spelling?.trim() || null,
  lemma: normalizeLemma(row.lemma, row.word_en?.trim() ?? ''),
});

/**
 * 行の検証。DBの NOT NULL / FK 制約に合わせ、取込時にバッチ全体が失敗しないよう事前に弾く。
 * 最初に見つかったエラーコードを返す（問題なければ null）
 */
export const validateCVImportEntry = (e: CVImportEntry): CVImportRowErrorCode | null => {
  if (!e.word_en) return 'wordEnEmpty';
  if (!e.part_of_speech) return 'posEmpty';
  if (!VALID_POS.has(e.part_of_speech)) return 'posInvalid';
  if (!e.word_ja) return 'wordJaEmpty';
  if (!e.syllables) return 'syllablesEmpty';
  if (Number.isNaN(e.primary_stress_syllable)) return 'stressEmpty';
  if (!Number.isInteger(e.primary_stress_syllable) || e.primary_stress_syllable < 1) return 'stressInvalid';

  const syllables = e.syllables.split('-');
  if (e.primary_stress_syllable > syllables.length) return 'stressOutOfRange';

  if (!e.stress_vowel_spelling) return 'vowelSpellingEmpty';
  const stressed = syllables[e.primary_stress_syllable - 1].toLowerCase();
  if (!stressed.includes(e.stress_vowel_spelling.toLowerCase())) return 'vowelSpellingMismatch';

  if (!e.cv_id) return 'cvIdEmpty';
  if (!VALID_CV_IDS.has(e.cv_id)) return 'cvIdInvalid';
  // 生徒アプリの単語分割と同じ文字種（英数字・アポストロフィ・ハイフン）のみ
  if (e.lemma && !/^[A-Za-z0-9'-]+$/.test(e.lemma)) return 'lemmaInvalid';
  return null;
};

/** 2行の内容が同一か（ファイル内重複の判定用） */
export const isSameCVImportEntry = (a: CVImportEntry, b: CVImportEntry): boolean =>
  a.word_ja === b.word_ja &&
  a.syllables === b.syllables &&
  a.primary_stress_syllable === b.primary_stress_syllable &&
  a.stress_vowel_spelling === b.stress_vowel_spelling &&
  a.cv_id === b.cv_id &&
  a.phonetic_spelling === b.phonetic_spelling &&
  (a.lemma ?? null) === (b.lemma ?? null);
