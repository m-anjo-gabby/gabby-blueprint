// apps/student/actions/colorVowelAction.ts
"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { createLogger, getLogContext } from "@gabby/lib/logger";

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

/** Server Action の返却型（Client 側に公開） */
export interface ColorVowelDicResult {
  wordEn: string;
  phoneticSpelling: string | null;
  primaryStressSyllable: number;
  wordAudioUrl: string | null;
  vowel: {
    cvId: string;
    cvName: string;
    description: string;
    vowelImageUrl: string;
    vowelAudioUrl: string | null;
  };
}

// -----------------------------------------------------------------------
// Server Action
// -----------------------------------------------------------------------

/**
 * 選択された英単語から Color Vowel 辞書データを検索し、
 * 付随するアセット Public URL を解決して返却する。
 *
 * - 辞書に存在しない場合は `null` を返す（正常系）
 * - エラー発生時は `null` を返し、pino ロガーに集約する
 */
export async function lookupColorVowelDictionary(
  rawWord: string
): Promise<ColorVowelDicResult | null> {
  const ctx = await getLogContext();

  // 1. サニタイズ（前後の記号・クォーテーションを除去し小文字化）
  const cleanWord = rawWord
    .trim()
    .replace(
      /^[.,\/#!$%\^&\*;:{}=\-_`~()\u201C\u201D\u2018\u2019"']+|[.,\/#!$%\^&\*;:{}=\-_`~()\u201C\u201D\u2018\u2019"']+$/g,
      ""
    )
    .toLowerCase();

  if (!cleanWord) return null;

  try {
    const supabase = await createServerClient();

    // 2. 辞書マスタ + Color Vowel マスタを結合して 1 件取得
    const { data: record, error } = await supabase
      .from("com_m_color_vowel_dictionary")
      .select(
        `
        word_en,
        phonetic_spelling,
        primary_stress_syllable,
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
      .ilike("word_en", cleanWord)
      .maybeSingle();

    if (error) {
      logger.error("cv_dict:lookup_failed", error.message, {
        ...ctx,
        payload: { rawWord, cleanWord },
      });
      return null;
    }

    if (!record || !record.vowel) {
      logger.info(
        "cv_dict:word_not_found",
        `Word '${cleanWord}' not found in dictionary`,
        { ...ctx, payload: { cleanWord } }
      );
      return null;
    }

    // 3. JOIN 結果を型安全に取り出す
    //    Supabase の select() 結合は単一結合の場合でもオブジェクト or 配列の可能性があるため
    //    配列であれば先頭要素、オブジェクトであればそのまま使用する
    const vowelRaw: ColorVowelJoinRow = Array.isArray(record.vowel)
      ? (record.vowel[0] as ColorVowelJoinRow)
      : (record.vowel as ColorVowelJoinRow);

    if (!vowelRaw) {
      logger.warn("cv_dict:vowel_join_empty", `Vowel join returned empty for '${cleanWord}'`, {
        ...ctx,
        payload: { cleanWord },
      });
      return null;
    }

    // 4. Storage Public URL 解決
    //    DBのパスにバケット名が含まれている場合（例: "color-vowels/images/..."）は
    //    getPublicUrl に渡す前にプレフィックスを除去する
    const bucketName = "color-vowels";
    const stripBucket = (path: string) =>
      path.startsWith(`${bucketName}/`) ? path.slice(bucketName.length + 1) : path;

    let wordAudioUrl: string | null = null;
    if (record.audio_path) {
      const { data: wAudio } = supabase.storage
        .from(bucketName)
        .getPublicUrl(stripBucket(record.audio_path));
      wordAudioUrl = wAudio.publicUrl;
    }

    const { data: vImage } = supabase.storage
      .from(bucketName)
      .getPublicUrl(stripBucket(vowelRaw.icon_path));

    let vowelAudioUrl: string | null = null;
    if (vowelRaw.audio_path) {
      const { data: vAudio } = supabase.storage
        .from(bucketName)
        .getPublicUrl(stripBucket(vowelRaw.audio_path));
      vowelAudioUrl = vAudio.publicUrl;
    }

    logger.info(
      "cv_dict:lookup_success",
      `Successfully looked up Color Vowel for '${cleanWord}'`,
      { ...ctx, payload: { cleanWord, cvId: vowelRaw.cv_id } }
    );

    return {
      wordEn: record.word_en,
      phoneticSpelling: record.phonetic_spelling ?? null,
      primaryStressSyllable: record.primary_stress_syllable,
      wordAudioUrl,
      vowel: {
        cvId: vowelRaw.cv_id,
        cvName: vowelRaw.cv_name,
        description: vowelRaw.description,
        vowelImageUrl: vImage.publicUrl,
        vowelAudioUrl,
      },
    };
  } catch (err) {
    logger.error(
      "cv_dict:lookup_unexpected",
      err instanceof Error ? err.message : "Unknown error",
      { ...ctx, payload: { rawWord } }
    );
    return null;
  }
}