'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { generateAzureAudioBuffer } from '@gabby/lib/azure/tts';
import { revalidatePath } from 'next/cache';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { type ColorVowelDictionaryRow } from '@gabby/types/colorVowel';

const logger = createLogger('admin');

// ============================================================
// 型定義
// ============================================================

/**
 * com_m_color_vowel_dictionary の行型
 * @gabby/types/colorVowel の ColorVowelDictionaryRow を共通型として使用
 * 導入元の変更なしに予備として re-export
 */
export type CVDictionaryEntry = ColorVowelDictionaryRow;

export interface CVWordSummary {
  word_en: string;
  entry_count: number;
  has_audio_count: number;
}

// ============================================================
// 取得系
// ============================================================

/**
 * 単語一覧の取得（word_en でグルーピングしたサマリー）
 */
export async function getCVDictionaryWords(): Promise<CVWordSummary[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_color_vowel_dictionary')
      .select('word_en, audio_path')
      .order('word_en', { ascending: true });

    if (error) {
      logger.error('cv_dict:get_words_failed', error.message, ctx);
      return [];
    }

    // クライアントサイドでグルーピング
    const map = new Map<string, { total: number; hasAudio: number }>();
    for (const row of data) {
      const key = row.word_en as string;
      const existing = map.get(key) ?? { total: 0, hasAudio: 0 };
      map.set(key, {
        total: existing.total + 1,
        hasAudio: existing.hasAudio + (row.audio_path ? 1 : 0),
      });
    }

    return Array.from(map.entries()).map(([word_en, counts]) => ({
      word_en,
      entry_count: counts.total,
      has_audio_count: counts.hasAudio,
    }));
  } catch (err) {
    logger.error('cv_dict:get_words_unexpected', err instanceof Error ? err.message : 'Unknown', ctx);
    return [];
  }
}

/**
 * 指定単語の品詞別エントリ一覧を取得
 */
export async function getCVDictionaryByWord(wordEn: string): Promise<CVDictionaryEntry[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_color_vowel_dictionary')
      .select('*')
      .eq('word_en', wordEn)
      .order('part_of_speech', { ascending: true });

    if (error) {
      logger.error('cv_dict:get_by_word_failed', error.message, { ...ctx, payload: { wordEn } });
      return [];
    }

    return data as CVDictionaryEntry[];
  } catch (err) {
    logger.error('cv_dict:get_by_word_unexpected', err instanceof Error ? err.message : 'Unknown', { ...ctx, payload: { wordEn } });
    return [];
  }
}

// ============================================================
// 更新系
// ============================================================

/**
 * エントリの登録または更新
 * PKは (word_en, part_of_speech) のためUpsertで処理
 */
export async function upsertCVDictionaryEntry(
  payload: Partial<CVDictionaryEntry> & { word_en: string; part_of_speech: string }
) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const entryData = {
      word_en: payload.word_en,
      part_of_speech: payload.part_of_speech,
      word_ja: payload.word_ja ?? '',
      syllables: payload.syllables ?? null,
      primary_stress_syllable: payload.primary_stress_syllable ?? null,
      stress_vowel_spelling: payload.stress_vowel_spelling ?? null,
      cv_id: payload.cv_id ?? null,
      phonetic_spelling: payload.phonetic_spelling ?? null,
      update_date: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('com_m_color_vowel_dictionary')
      .upsert([{ ...entryData, insert_date: new Date().toISOString() }], {
        onConflict: 'word_en,part_of_speech',
      });

    if (error) {
      logger.error('cv_dict:upsert_failed', error.message, { ...ctx, payload });
      return { success: false, message: error.message };
    }

    revalidatePath('/tools/cv-dictionary');
    return { success: true, message: '登録しました' };
  } catch (err) {
    logger.error('cv_dict:upsert_unexpected', err instanceof Error ? err.message : 'Unknown', { ...ctx, payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * エントリの削除
 */
export async function deleteCVDictionaryEntry(wordEn: string, partOfSpeech: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 音声ファイルのパスを先に取得
    const { data: existing } = await supabase
      .from('com_m_color_vowel_dictionary')
      .select('audio_path')
      .eq('word_en', wordEn)
      .eq('part_of_speech', partOfSpeech)
      .single();

    const { error } = await supabase
      .from('com_m_color_vowel_dictionary')
      .delete()
      .eq('word_en', wordEn)
      .eq('part_of_speech', partOfSpeech);

    if (error) {
      logger.error('cv_dict:delete_failed', error.message, { ...ctx, payload: { wordEn, partOfSpeech } });
      return { success: false, message: error.message };
    }

    // Storage上の音声ファイルを削除（audioバケット）
    if (existing?.audio_path) {
      await supabase.storage.from('audio').remove([existing.audio_path]);
    }

    revalidatePath('/tools/cv-dictionary');
    return { success: true, message: '削除しました' };
  } catch (err) {
    logger.error('cv_dict:delete_unexpected', err instanceof Error ? err.message : 'Unknown', { ...ctx, payload: { wordEn, partOfSpeech } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * TSV/CSV 一括インポート
 */
export async function bulkUpsertCVDictionary(
  entries: Array<Partial<CVDictionaryEntry> & { word_en: string; part_of_speech: string }>
) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const now = new Date().toISOString();
    const rows = entries.map((e) => ({
      word_en: e.word_en,
      part_of_speech: e.part_of_speech,
      word_ja: e.word_ja ?? '',
      syllables: e.syllables ?? null,
      primary_stress_syllable: e.primary_stress_syllable != null ? Number(e.primary_stress_syllable) : null,
      stress_vowel_spelling: e.stress_vowel_spelling ?? null,
      cv_id: e.cv_id ?? null,
      phonetic_spelling: e.phonetic_spelling ?? null,
      insert_date: now,
      update_date: now,
    }));

    const { error } = await supabase
      .from('com_m_color_vowel_dictionary')
      .upsert(rows, { onConflict: 'word_en,part_of_speech' });

    if (error) {
      logger.error('cv_dict:bulk_upsert_failed', error.message, ctx);
      return { success: false, message: error.message };
    }

    revalidatePath('/tools/cv-dictionary');
    return { success: true, message: `${entries.length}件を処理しました` };
  } catch (err) {
    logger.error('cv_dict:bulk_upsert_unexpected', err instanceof Error ? err.message : 'Unknown', ctx);
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

// ============================================================
// 音声生成系
// ============================================================

/**
 * 個別エントリの音声生成・保存
 * Azure TTS → Storage アップロード → DB更新
 */
export async function saveCVDictionaryAudio(
  wordEn: string,
  partOfSpeech: string,
  ssml: string,
  mode: 'auto' | 'manual',
  adjustmentData: unknown,
  currentAudioPath?: string | null
) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. Azure で音声合成
    const audioBuffer = await generateAzureAudioBuffer(ssml);

    // 2. ファイルパス生成
    // audioバケット配下: dictionary/{word_en}/{pos}-{timestamp}.mp3
    // words/  sprints/ と並ぶ統一構造
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const safePOS = partOfSpeech.toLowerCase().replace(/[^a-z]/g, '_');
    const safeWord = wordEn.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newFilePath = `dictionary/${safeWord}/${safePOS}-${timestamp}.mp3`;

    // 3. Storage アップロード
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(newFilePath, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadError) {
      logger.error('cv_dict:audio_upload_failed', uploadError.message, {
        ...ctx, payload: { wordEn, partOfSpeech, newFilePath },
      });
      throw uploadError;
    }

    // 4. DB 更新
    const { error: dbError } = await supabase
      .from('com_m_color_vowel_dictionary')
      .update({
        audio_path: newFilePath,
        tts_status: 1,
        tts_ssml: ssml,
        tts_ssml_mode: mode,
        tts_adjustments: adjustmentData,
        last_tts_date: new Date().toISOString(),
        update_date: new Date().toISOString(),
      })
      .eq('word_en', wordEn)
      .eq('part_of_speech', partOfSpeech);

    if (dbError) {
      logger.error('cv_dict:audio_db_update_failed', dbError.message, {
        ...ctx, payload: { wordEn, partOfSpeech, newFilePath },
      });
      await supabase.storage.from('audio').remove([newFilePath]);
      throw dbError;
    }

    // 5. 古いファイルがあれば削除
    if (currentAudioPath && currentAudioPath !== newFilePath) {
      await supabase.storage.from('audio').remove([currentAudioPath]);
    }

    logger.info('cv_dict:audio_saved', `Audio updated: ${wordEn} [${partOfSpeech}]`, {
      ...ctx, payload: { wordEn, partOfSpeech, path: newFilePath },
    });

    revalidatePath('/tools/cv-dictionary');
    return { success: true, message: '音声を更新しました', path: newFilePath };
  } catch (err) {
    logger.error('cv_dict:audio_save_unexpected', err instanceof Error ? err.message : 'Unknown', {
      ...ctx, payload: { wordEn, partOfSpeech },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 全エントリ一覧の取得（一括音声生成用）
 */
export async function getAllCVDictionaryEntries(): Promise<CVDictionaryEntry[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_color_vowel_dictionary')
      .select('*')
      .order('word_en', { ascending: true });

    if (error) {
      logger.error('cv_dict:get_all_failed', error.message, ctx);
      return [];
    }

    return data as CVDictionaryEntry[];
  } catch (err) {
    logger.error('cv_dict:get_all_unexpected', err instanceof Error ? err.message : 'Unknown', ctx);
    return [];
  }
}
