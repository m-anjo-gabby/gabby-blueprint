'use server';

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { removeStorageFiles } from '@gabby/lib/storage/removeStorageFiles';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import type { ActionResult, BasicErrorCode, CoreResult } from '@gabby/types/action';
import type { TableInsert } from '@gabby/types/db';
import { type PhraseRecord, type WordRecord } from '@gabby/types/word';
import { ADMIN_OR_CONTENT_MANAGER, requireAdminRole } from '@/lib/adminAuth';

const logger = createLogger('admin');

/** 単語の登録・更新の入力（word_id があれば更新） */
export type WordInput = Pick<WordRecord, 'content_id' | 'word_en' | 'word_ja'> &
  Partial<Pick<WordRecord, 'word_id' | 'frequency_rank' | 'status'>>;

/** 単語・フレーズの一括登録の1語分（CSV の同じ単語の行をまとめたもの） */
export interface WordBulkImportItem {
  word_en: string;
  word_ja: string;
  frequency_rank: number;
  phrases: Pick<PhraseRecord, 'phrase_en' | 'phrase_ja' | 'phrase_type'>[];
}

/** フレーズの登録・更新の入力（phrase_id があれば更新） */
export type PhraseInput = Pick<PhraseRecord, 'word_id' | 'phrase_en' | 'phrase_ja' | 'phrase_type'> &
  Partial<Pick<PhraseRecord, 'phrase_id' | 'seq_no' | 'status'>>;

/**
 * 特定の教材に紐づく単語一覧を取得する
 */
export async function getWordsByContentId(
  contentId: string,
): Promise<CoreResult<{ data: WordRecord[] }, BasicErrorCode>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_word')
      .select('*')
      .eq('content_id', contentId)
      .order('frequency_rank', { ascending: true });

    if (error) {
      logger.error('word:get_words_by_content_id_failed', error.message, {
        ...ctx,
        err: error,
        payload: { contentId },
      });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, data: data as WordRecord[] };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('word:get_words_by_content_id_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { contentId },
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 単語の登録または更新 (Upsert)
 */
export async function upsertWord(payload: WordInput): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
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
        .insert([
          {
            ...wordData,
            insert_date: new Date().toISOString(),
          },
        ])
        .select('word_id')
        .single();
      error = insertError;
      if (insertData) savedWordId = insertData.word_id;
    }

    if (error) {
      logger.error('word:upsert_word_failed', error.message, { ...ctx, err: error, payload });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('word:upsert_word_success', `Word ${isEdit ? 'updated' : 'created'}: ${payload.word_en}`, {
      ...ctx,
      payload: { wordId: savedWordId, wordEn: payload.word_en, isEdit },
    });

    revalidatePath('/contents/[id]/words', 'page');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('word:upsert_word_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload,
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 単語の物理削除（関連するStorage内の音声ファイルも含む）
 */
export async function deleteWord(wordId: string): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. DBから単語を削除（フレーズは CASCADE で消える）
    const { error: dbError } = await supabase.from('com_m_word').delete().eq('word_id', wordId);

    if (dbError) {
      logger.error('word:delete_word_db_failed', dbError.message, { ...ctx, err: dbError, payload: { wordId } });
      throw dbError;
    }

    // 2. 単語の音声のフォルダ（words/{word_id}/phrases）の中のファイルを消す（失敗はログだけ残す）
    const folderPath = `words/${wordId}/phrases`;
    const { data: files, error: listError } = await supabase.storage.from('audio').list(folderPath);
    if (listError) {
      logger.error('word:delete_files_failed', listError.message, {
        ...ctx,
        err: listError,
        payload: { wordId, folderPath },
      });
    } else {
      await removeStorageFiles(
        supabase,
        'audio',
        (files ?? []).map((f) => `${folderPath}/${f.name}`),
        {
          event: 'word:delete_files_failed',
          ctx,
          payload: { wordId },
        },
      );
    }

    logger.info('word:delete_word_success', `Word deleted`, { ...ctx, payload: { wordId } });
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('word:delete_word_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { wordId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 特定の単語に紐づくフレーズ一覧を取得する
 */
export async function getPhrasesByWordId(
  wordId: string,
): Promise<CoreResult<{ data: PhraseRecord[] }, BasicErrorCode>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('com_m_phrase')
      .select('*')
      .eq('word_id', wordId)
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error('word:get_phrases_by_word_id_failed', error.message, { ...ctx, err: error, payload: { wordId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    return { success: true, data: data as PhraseRecord[] };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('word:get_phrases_by_word_id_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { wordId },
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 特定のコンテンツに紐づくすべてのフレーズを取得する
 */
export async function getPhrasesByContentId(contentId: string): Promise<PhraseRecord[]> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const PAGE_SIZE = 1000;
    let allData: PhraseRecord[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('com_m_phrase')
        .select(
          `
          *,
          com_m_word!inner(content_id)
        `,
        )
        .eq('com_m_word.content_id', contentId)
        .order('word_id', { ascending: true })
        .order('seq_no', { ascending: true })
        .order('phrase_id', { ascending: true }) // 同順位の並びを固定し、分割取得での重複・欠落を防ぐ
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        logger.error('word:get_phrases_by_content_id_failed', error.message, {
          ...ctx,
          err: error,
          payload: { contentId },
        });
        return [];
      }

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    return allData as PhraseRecord[];
  } catch (err) {
    unstable_rethrow(err);
    logger.error('word:get_phrases_by_content_id_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { contentId },
    });
    return [];
  }
}

/**
 * フレーズの登録または更新 (Upsert)
 */
export async function upsertPhrase(payload: PhraseInput): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
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
      logger.error('word:upsert_phrase_failed', error.message, { ...ctx, err: error, payload });
      if (error.code === '23505') {
        return { success: false, message: t('contents.errors.duplicateSeqNo') };
      }
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('word:upsert_phrase_success', `Phrase ${isEdit ? 'updated' : 'created'} for word: ${payload.word_id}`, {
      ...ctx,
      payload: { phraseId: savedPhraseId, wordId: payload.word_id, isEdit },
    });

    revalidatePath('/contents/[id]/words', 'page');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('word:upsert_phrase_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload,
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * フレーズの物理削除
 */
export async function deletePhrase(phraseId: string): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // DB を先に消し、音声のパスは削除した行から取る（画面から渡されたパスは使わない）
    const { data: deleted, error: dbError } = await supabase
      .from('com_m_phrase')
      .delete()
      .eq('phrase_id', phraseId)
      .select('audio_path')
      .maybeSingle();

    if (dbError) {
      logger.error('word:delete_phrase_db_failed', dbError.message, { ...ctx, err: dbError, payload: { phraseId } });
      throw dbError;
    }

    await removeStorageFiles(supabase, 'audio', [deleted?.audio_path], {
      event: 'word:delete_phrase_files_failed',
      ctx,
      payload: { phraseId },
    });

    logger.info('word:delete_phrase_success', `Phrase deleted`, { ...ctx, payload: { phraseId } });
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('word:delete_phrase_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { phraseId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 単語とフレーズの一括Upsert
 */
export async function bulkUpsertWordsAndPhrases(
  contentId: string,
  payload: WordBulkImportItem[],
): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. 単語の Upsert
    const wordPromises = payload.map(async (item) => {
      const { data: word, error: wordError } = await supabase
        .from('com_m_word')
        .upsert(
          {
            content_id: contentId,
            word_en: item.word_en,
            word_ja: item.word_ja,
            frequency_rank: item.frequency_rank,
            status: 'live',
            update_date: new Date().toISOString(),
          },
          { onConflict: 'content_id,word_en' },
        )
        .select('word_id')
        .single();

      if (wordError) {
        logger.error('word:bulk_upsert_word_failed', wordError.message, {
          ...ctx,
          err: wordError,
          payload: { contentId, item },
        });
        throw wordError;
      }
      return { word_id: word.word_id, phrases: item.phrases };
    });

    const results = await Promise.all(wordPromises);

    // 2. フレーズの更新
    const wordIds = results.map((r) => r.word_id);
    const { data: deletedPhrases, error: deleteError } = await supabase
      .from('com_m_phrase')
      .delete()
      .in('word_id', wordIds)
      .select('audio_path');

    if (deleteError) {
      logger.error('word:bulk_upsert_delete_phrases_failed', deleteError.message, {
        ...ctx,
        err: deleteError,
        payload: { wordIds },
      });
      throw deleteError;
    }

    const allPhrasesToInsert: TableInsert<'com_m_phrase'>[] = results.flatMap((res) => {
      return res.phrases.map((p, index) => ({
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
      const { error: phraseError } = await supabase.from('com_m_phrase').insert(allPhrasesToInsert);

      if (phraseError) {
        logger.error('word:bulk_upsert_insert_phrases_failed', phraseError.message, {
          ...ctx,
          err: phraseError,
          payload: { contentId },
        });
        throw phraseError;
      }
    }

    // 洗い替えで消したフレーズの音声を消す（取り込んだフレーズは音声を持たないため、すべて不要になる）
    await removeStorageFiles(
      supabase,
      'audio',
      (deletedPhrases ?? []).map((p) => p.audio_path as string | null),
      {
        event: 'word:bulk_upsert_delete_files_failed',
        ctx,
        payload: { contentId },
      },
    );

    logger.info('word:bulk_upsert_success', `Bulk upsert completed`, {
      ...ctx,
      payload: { contentId, wordCount: results.length, phraseCount: allPhrasesToInsert.length },
    });

    revalidatePath(`/contents/${contentId}/words`);
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('word:bulk_upsert_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { contentId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}
