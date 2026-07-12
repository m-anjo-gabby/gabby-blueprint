// packages/types/colorVowel.ts

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
  cv_id: string;
  primary_stress_syllable: number;
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