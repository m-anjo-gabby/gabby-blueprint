'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { PhraseRecord, WordRecord } from '@gabby/types/word';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';

const logger = createLogger('admin');

/**
 * 特定の教材に紐づく単語一覧を取得する
 */
export async function getWordsByContentId(contentId: string): Promise<WordRecord[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_word')
      .select('*')
      .eq('content_id', contentId)
      .order('frequency_rank', { ascending: true });

    if (error) {
      logger.error('word:get_words_by_content_id_failed', error.message, { ...ctx, payload: { contentId } });
      return [];
    }

    return data as WordRecord[];
  } catch (err) {
    logger.error('word:get_words_by_content_id_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { contentId } });
    return [];
  }
}

/**
 * 単語の登録または更新 (Upsert)
 */
export async function upsertWord(payload: Partial<WordRecord>) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const isEdit = !!payload.word_id;

    const wordData = {
      content_id: payload.content_id,
      word_en: payload.word_en,
      word_ja: payload.word_ja,
      frequency_rank: payload.frequency_rank,
      status: payload.status,
      update_date: new Date().toISOString(),
    };

    let error;
    let savedWordId = payload.word_id;

    if (isEdit) {
      const { error: updateError } = await supabase
        .from('com_m_word')
        .update(wordData)
        .eq('word_id', payload.word_id as string);
      error = updateError;
    } else {
      const { data: insertData, error: insertError } = await supabase
        .from('com_m_word')
        .insert([{ 
          ...wordData, 
          insert_date: new Date().toISOString() 
        }])
        .select('word_id')
        .single();
      error = insertError;
      if (insertData) savedWordId = insertData.word_id;
    }

    if (error) {
      logger.error('word:upsert_word_failed', error.message, { ...ctx, payload });
      return { success: false, message: error.message || "データベース操作に失敗しました" };
    }

    logger.info('word:upsert_word_success', `Word ${isEdit ? 'updated' : 'created'}: ${payload.word_en}`, { 
      ...ctx,
      payload: { wordId: savedWordId, wordEn: payload.word_en, isEdit } 
    });

    revalidatePath('/contents/[id]/words', 'page');
    return { success: true };
  } catch (error) {
    logger.error('word:upsert_word_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 単語の物理削除（関連するStorage内の音声ファイルも含む）
 */
export async function deleteWord(wordId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. Storage内の該当単語ディレクトリ配下のファイルをリストアップ
    const folderPath = `words/${wordId}/phrases`;
    const { data: files, error: listError } = await supabase
      .storage
      .from('audio')
      .list(folderPath);

    // 2. ファイルが存在すれば一括削除
    if (files && files.length > 0) {
      const pathsToDelete = files.map(f => `${folderPath}/${f.name}`);
      const { error: removeError } = await supabase
        .storage
        .from('audio')
        .remove(pathsToDelete);

      if (removeError) {
        logger.warn("word:storage_cleanup_failed", `Storage Cleanup Error (non-critical): ${removeError.message}`, { ...ctx, payload: { wordId, folderPath } });
      }
    }

    // 3. DBから単語を削除
    const { error: dbError } = await supabase
      .from('com_m_word')
      .delete()
      .eq('word_id', wordId);

    if (dbError) {
      logger.error('word:delete_word_db_failed', dbError.message, { ...ctx, payload: { wordId } });
      throw dbError;
    }

    logger.info('word:delete_word_success', `Word deleted`, { ...ctx, payload: { wordId } });
    return { success: true };

  } catch (error) {
    logger.error("word:delete_word_unexpected", error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { wordId } });
    return { success: false, message: "予期せぬエラーが発生しました" };
  }
}

/**
 * 特定の単語に紐づくフレーズ一覧を取得する
 */
export async function getPhrasesByWordId(wordId: string): Promise<PhraseRecord[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('com_m_phrase')
      .select('*')
      .eq('word_id', wordId)
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error('word:get_phrases_by_word_id_failed', error.message, { ...ctx, payload: { wordId } });
      return [];
    }
    return data as PhraseRecord[];
  } catch (err) {
    logger.error('word:get_phrases_by_word_id_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { wordId } });
    return [];
  }
}

/**
 * フレーズの登録または更新 (Upsert)
 */
export async function upsertPhrase(payload: Partial<PhraseRecord>) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const isEdit = !!payload.phrase_id;

    const phraseData = {
      word_id: payload.word_id,
      phrase_en: payload.phrase_en,
      phrase_ja: payload.phrase_ja,
      phrase_type: payload.phrase_type,
      seq_no: payload.seq_no,
      status: payload.status,
      update_date: new Date().toISOString(),
    };

    let error;
    let savedPhraseId = payload.phrase_id;

    if (isEdit) {
      const { error: updateError } = await supabase
        .from('com_m_phrase')
        .update(phraseData)
        .eq('phrase_id', payload.phrase_id as string);
      error = updateError;
    } else {
      const { data: insertData, error: insertError } = await supabase
        .from('com_m_phrase')
        .insert([{ ...phraseData, insert_date: new Date().toISOString() }])
        .select('phrase_id')
        .single();
      error = insertError;
      if (insertData) savedPhraseId = insertData.phrase_id;
    }

    if (error) {
      logger.error('word:upsert_phrase_failed', error.message, { ...ctx, payload });
      if (error.code === '23505') {
        return { success: false, message: "表示順 (Seq No) が重複しています。" };
      }
      return { success: false, message: error.message };
    }

    logger.info('word:upsert_phrase_success', `Phrase ${isEdit ? 'updated' : 'created'} for word: ${payload.word_id}`, { 
      ...ctx,
      payload: { phraseId: savedPhraseId, wordId: payload.word_id, isEdit } 
    });

    revalidatePath('/contents/[id]/words', 'page');
    return { success: true };
  } catch (error) {
    logger.error('word:upsert_phrase_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * フレーズの物理削除
 */
export async function deletePhrase(phraseId: string, audioPath?: string | null) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    if (audioPath) {
      if (!audioPath.includes(phraseId)) {
        logger.error('word:delete_phrase_security_alert', `Attempted unauthorized path deletion. phraseId: ${phraseId}, path: ${audioPath}`, ctx);
        throw new Error("不正なファイルパスです。");
      }

      const { error: storageError } = await supabase.storage
        .from('audio')
        .remove([audioPath]);

      if (storageError) {
        logger.warn("word:delete_phrase_storage_failed", `Storage deletion warning: ${storageError.message}`, { ...ctx, payload: { phraseId, audioPath } });
      }
    }

    const { error: dbError } = await supabase
      .from('com_m_phrase')
      .delete()
      .eq('phrase_id', phraseId);

    if (dbError) {
      logger.error('word:delete_phrase_db_failed', dbError.message, { ...ctx, payload: { phraseId } });
      throw dbError;
    }

    logger.info('word:delete_phrase_success', `Phrase deleted`, { ...ctx, payload: { phraseId, audioPath } });
    return { success: true };
  } catch (error) {
    logger.error("word:delete_phrase_unexpected", error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { phraseId, audioPath } });
    return { success: false, message: error instanceof Error ? error.message : '予期せぬエラーが発生しました' };
  }
}

/**
 * 単語とフレーズの一括Upsert
 */
export async function bulkUpsertWordsAndPhrases(contentId: string, payload: any[]) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. 単語の Upsert
    const wordPromises = payload.map(async (item) => {
      const { data: word, error: wordError } = await supabase
        .from('com_m_word')
        .upsert({
          content_id: contentId,
          word_en: item.word_en,
          word_ja: item.word_ja,
          frequency_rank: item.frequency_rank,
          status: 'live',
          update_date: new Date().toISOString(),
        }, { onConflict: 'content_id,word_en' })
        .select('word_id')
        .single();

      if (wordError) {
        logger.error('word:bulk_upsert_word_failed', wordError.message, { ...ctx, payload: { contentId, item } });
        throw wordError;
      }
      return { word_id: word.word_id, phrases: item.phrases };
    });

    const results = await Promise.all(wordPromises);

    // 2. フレーズの更新
    const wordIds = results.map(r => r.word_id);
    const { error: deleteError } = await supabase
      .from('com_m_phrase')
      .delete()
      .in('word_id', wordIds);

    if (deleteError) {
      logger.error('word:bulk_upsert_delete_phrases_failed', deleteError.message, { ...ctx, payload: { wordIds } });
      throw deleteError;
    }

    const allPhrasesToInsert = results.flatMap((res) => {
      return res.phrases.map((p: any, index: number) => ({
        word_id: res.word_id,
        phrase_en: p.phrase_en,
        phrase_ja: p.phrase_ja,
        phrase_type: p.phrase_type,
        seq_no: index + 1,
        status: 'live',
        insert_date: new Date().toISOString(),
        update_date: new Date().toISOString(),
      }));
    });

    if (allPhrasesToInsert.length > 0) {
      const { error: phraseError } = await supabase
        .from('com_m_phrase')
        .insert(allPhrasesToInsert);
      
      if (phraseError) {
        logger.error('word:bulk_upsert_insert_phrases_failed', phraseError.message, { ...ctx, payload: { contentId } });
        throw phraseError;
      }
    }

    logger.info('word:bulk_upsert_success', `Bulk upsert completed`, { 
      ...ctx,
      payload: { contentId, wordCount: results.length, phraseCount: allPhrasesToInsert.length } 
    });

    revalidatePath(`/contents/${contentId}/words`);
    return { success: true };

  } catch (err) {
    logger.error("word:bulk_upsert_unexpected", err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { contentId } });
    return { success: false, message: "予期せぬエラーが発生しました" };
  }
}