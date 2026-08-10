// apps/student/actions/colorVowelAction.ts
"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";
import { type ColorVowelDicResult, getPartOfSpeechSeqNo } from "@gabby/types/colorVowel";

const logger = createLogger('student');

// -----------------------------------------------------------------------
// 型定義
// -----------------------------------------------------------------------

/** Supabase JOIN クエリの返却型 */
interface ColorVowelJoinRow {
  cv_id: string;
  cv_name: string;
  description: string;
  icon_path: string;
  audio_path: string;
}

// -----------------------------------------------------------------------
// Server Action
// -----------------------------------------------------------------------

/**
 * 選択された英単語から Color Vowel 辞書データを検索し、
 * 付随するアセット Public URL を解決して返却する。
 *
 * - 辞書に存在しない場合は空配列 `[]` を返す（正常系）
 * - エラー発生時は `[]` を返し、pino ロガーに集約する
 */
export async function lookupColorVowelDictionary(
  rawWord: string
): Promise<ColorVowelDicResult[]> {
  const ctx = await getLogContext();

  // 1. サニタイズ（前後の記号・クォーテーションを除去し小文字化）
  const cleanWord = rawWord
    .trim()
    .replace(
      /^[.,\/#!$%\^&\*;:{}=\-_`~()\u201C\u201D\u2018\u2019"']+|[.,\/#!$%\^&\*;:{}=\-_`~()\u201C\u201D\u2018\u2019"']+$/g,
      ""
    )
    .toLowerCase();

  if (!cleanWord) return [];

  try {
    const supabase = await createServerClient();

    // 2. 辞書マスタ + Color Vowel マスタを結合して該当する全単語・品詞ペアを取得
    const { data: records, error } = await supabase
      .from("com_m_color_vowel_dictionary")
      .select(
        `
        dic_id,
        word_en,
        part_of_speech,
        word_ja,
        syllables,
        primary_stress_syllable,
        stress_vowel_spelling,
        phonetic_spelling,
        audio_path,
        vowel:com_m_color_vowel (
          cv_id,
          cv_name,
          description,
          icon_path,
          audio_path
        )
      `
      )
      .eq("status", "live")
      .eq("delete_flg", 0)
      .ilike("word_en", cleanWord);

    if (error) {
      logger.error("cv_dict:lookup_failed", error.message, {
        ...ctx,
        payload: { rawWord, cleanWord },
      });
      return [];
    }

    if (!records || records.length === 0) {
      logger.info(
        "cv_dict:word_not_found",
        `Word '${cleanWord}' not found in dictionary`,
        { ...ctx, payload: { cleanWord } }
      );
      return [];
    }

    const results: ColorVowelDicResult[] = [];

    for (const record of records) {
      if (!record.vowel) continue;

      const vowelRaw: ColorVowelJoinRow = Array.isArray(record.vowel)
        ? (record.vowel[0] as ColorVowelJoinRow)
        : (record.vowel as ColorVowelJoinRow);

      if (!vowelRaw) {
        logger.warn("cv_dict:vowel_join_empty", `Vowel join returned empty for '${cleanWord}'`, {
          ...ctx,
          payload: { cleanWord },
        });
        continue;
      }

      // Storage Public URL 解決
      const cvBucketName = "color-vowels";
      const audioBucketName = "audio";

      const stripBucketPrefix = (path: string, bucket: string) =>
        path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;

      let wordAudioUrl: string | null = null;
      if (record.audio_path) {
        const cleanPath = stripBucketPrefix(record.audio_path, audioBucketName);
        const { data: wAudio } = supabase.storage
          .from(audioBucketName)
          .getPublicUrl(cleanPath);
        wordAudioUrl = wAudio.publicUrl;
      }

      const { data: vImage } = supabase.storage
        .from(cvBucketName)
        .getPublicUrl(stripBucketPrefix(vowelRaw.icon_path, cvBucketName));

      let vowelAudioUrl: string | null = null;
      if (vowelRaw.audio_path) {
        const cleanPath = stripBucketPrefix(vowelRaw.audio_path, cvBucketName);
        const { data: vAudio } = supabase.storage
          .from(cvBucketName)
          .getPublicUrl(cleanPath);
        vowelAudioUrl = vAudio.publicUrl;
      }

      results.push({
        dicId: record.dic_id,
        wordEn: record.word_en,
        partOfSpeech: record.part_of_speech,
        wordJa: record.word_ja,
        syllables: record.syllables,
        primaryStressSyllable: record.primary_stress_syllable,
        stressVowelSpelling: record.stress_vowel_spelling,
        phoneticSpelling: record.phonetic_spelling ?? null,
        wordAudioUrl,
        vowel: {
          cvId: vowelRaw.cv_id,
          cvName: vowelRaw.cv_name,
          description: vowelRaw.description,
          vowelImageUrl: vImage.publicUrl,
          vowelAudioUrl,
        },
      });
    }

    logger.info(
      "cv_dict:lookup_success",
      `Successfully looked up Color Vowel for '${cleanWord}' (found ${results.length} record(s))`,
      { ...ctx, payload: { cleanWord, count: results.length } }
    );

    // 品詞の表示順序（seq_no）に従って昇順ソート
    results.sort((a, b) => getPartOfSpeechSeqNo(a.partOfSpeech) - getPartOfSpeechSeqNo(b.partOfSpeech));

    return results;
  } catch (err) {
    logger.error(
      "cv_dict:lookup_unexpected",
      err instanceof Error ? err.message : "Unknown error",
      { ...ctx, payload: { rawWord } }
    );
    return [];
  }
}