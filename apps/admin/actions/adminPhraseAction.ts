'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { PhraseRecord } from '@gabby/types/word';
import { revalidatePath } from 'next/cache';
import { createLogger, getLogContext } from '@gabby/lib/logger';

const logger = createLogger('admin');

/**
 * 特定の単語に紐づくフレーズ一覧を取得する
 */
export async function getPhrasesByWordId(wordId: string): Promise<PhraseRecord[]> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('com_m_phrase')
      .select('*')
      .eq('word_id', wordId)
      .eq('delete_flg', '0')
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error('phrase:get_phrases_by_word_id_failed', error.message, { ...ctx, payload: { wordId } });
      return [];
    }

    return data as PhraseRecord[];
  } catch (err) {
    logger.error('phrase:get_phrases_by_word_id_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { wordId } });
    return [];
  }
}

/**
 * フレーズの新規作成
 */
export async function createPhrase(wordId: string, seqNo: number) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('com_m_phrase')
      .insert([
        {
          word_id: wordId,
          seq_no: seqNo,
          phrase_type: 1, // デフォルト: S+V
          phrase_en: 'New English phrase',
          phrase_ja: '新しいフレーズ',
          tts_status: 0,  // 未生成
          delete_flg: '0',
        },
      ])
      .select()
      .single();

    if (error) {
      logger.error('phrase:create_phrase_failed', error.message, { ...ctx, payload: { wordId, seqNo } });
      return { success: false, message: error.message };
    }

    const newPhrase = data as PhraseRecord;
    logger.info('phrase:create_phrase_success', `Phrase created for word: ${wordId}`, { 
      ...ctx,
      payload: { phraseId: newPhrase.phrase_id, wordId } 
    });

    return { success: true, data: newPhrase };
  } catch (err) {
    logger.error('phrase:create_phrase_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { wordId, seqNo } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * フレーズの更新 (インライン編集 & ステータス自動変更)
 */
export async function updatePhrase(
  phraseId: string,
  updates: Partial<Pick<PhraseRecord, 'phrase_en' | 'phrase_ja' | 'phrase_type' | 'seq_no' | 'tts_ssml'>>
) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    // 英文(phrase_en)またはSSMLが変更された場合のみ、ステータスを「要更新(2)」にする
    const isAudioAffected = 'phrase_en' in updates || 'tts_ssml' in updates;
    
    const dataToUpdate = {
      ...updates,
      update_date: new Date().toISOString(),
      ...(isAudioAffected ? { tts_status: 2 } : {})
    };

    const { data, error } = await supabase
      .from('com_m_phrase')
      .update(dataToUpdate)
      .eq('phrase_id', phraseId)
      .select()
      .single();

    if (error) {
      logger.error('phrase:update_phrase_failed', error.message, { ...ctx, payload: { phraseId, updates } });
      return { success: false, message: error.message };
    }

    logger.info('phrase:update_phrase_success', `Phrase updated`, { 
      ...ctx,
      payload: { phraseId, isAudioAffected } 
    });

    return { success: true, data: data as PhraseRecord };
  } catch (err) {
    logger.error('phrase:update_phrase_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { phraseId, updates } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * フレーズの論理削除
 */
export async function deletePhrase(phraseId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('com_m_phrase')
      .update({ 
        delete_flg: '1',
        update_date: new Date().toISOString() 
      })
      .eq('phrase_id', phraseId);

    if (error) {
      logger.error('phrase:delete_phrase_failed', error.message, { ...ctx, payload: { phraseId } });
      return { success: false, message: error.message };
    }

    logger.info('phrase:delete_phrase_success', `Phrase logically deleted`, { 
      ...ctx,
      payload: { phraseId } 
    });

    return { success: true };
  } catch (err) {
    logger.error('phrase:delete_phrase_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { phraseId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 特定のコンテンツに紐づくすべてのフレーズを取得する
 */
export async function getPhrasesByContentId(contentId: string): Promise<PhraseRecord[]> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('com_m_phrase')
        .select(`
          *,
          com_m_word!inner(content_id)
        `)
        .eq('com_m_word.content_id', contentId)
        .order('word_id', { ascending: true })
        .order('seq_no', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        logger.error('phrase:get_phrases_by_content_id_failed', error.message, { ...ctx, payload: { contentId } });
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
    logger.error('phrase:get_phrases_by_content_id_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { contentId } });
    return [];
  }
}