'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { PhraseRecord } from '@gabby/types/word'; // 定義した Record 型
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger/logger';

const logger = createLogger('admin');

/**
 * 特定の単語に紐づくフレーズ一覧を取得する
 */
export async function getPhrasesByWordId(wordId: string): Promise<PhraseRecord[]> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('com_m_phrase')
      .select('*')
      .eq('word_id', wordId)
      .eq('delete_flg', '0')
      .order('seq_no', { ascending: true }); // SEQ順に並べる

    if (error) {
      logger.error('phrase:get_phrases_by_word_id_failed', error.message, { wordId });
      return [];
    }

    return data as PhraseRecord[];
  } catch (err) {
    logger.error('phrase:get_phrases_by_word_id_unexpected', err instanceof Error ? err.message : 'Unknown error', { wordId });
    return [];
  }
}

/**
 * フレーズの新規作成
 */
export async function createPhrase(wordId: string, seqNo: number) {
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
      logger.error('phrase:create_phrase_failed', error.message, { wordId, seqNo });
      return { success: false, message: error.message };
    }

    const newPhrase = data as PhraseRecord;
    logger.info('phrase:create_phrase_success', `Phrase created for word: ${wordId}`, { 
      payload: { phraseId: newPhrase.phrase_id, wordId } 
    });

    return { success: true, data: newPhrase };
  } catch (err) {
    logger.error('phrase:create_phrase_unexpected', err instanceof Error ? err.message : 'Unknown error', { wordId, seqNo });
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
      logger.error('phrase:update_phrase_failed', error.message, { phraseId, updates });
      return { success: false, message: error.message };
    }

    logger.info('phrase:update_phrase_success', `Phrase updated`, { 
      payload: { phraseId } 
    });

    return { success: true, data: data as PhraseRecord };
  } catch (err) {
    logger.error('phrase:update_phrase_unexpected', err instanceof Error ? err.message : 'Unknown error', { phraseId, updates });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * フレーズの論理削除
 */
export async function deletePhrase(phraseId: string) {
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
      logger.error('phrase:delete_phrase_failed', error.message, { phraseId });
      return { success: false, message: error.message };
    }

    logger.info('phrase:delete_phrase_success', `Phrase logically deleted`, { 
      payload: { phraseId } 
    });

    return { success: true };
  } catch (err) {
    logger.error('phrase:delete_phrase_unexpected', err instanceof Error ? err.message : 'Unknown error', { phraseId });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 特定のコンテンツに紐づくすべてのフレーズを（単語を跨いで）取得する
 */
export async function getPhrasesByContentId(contentId: string): Promise<PhraseRecord[]> {
  try {
    const supabase = createAdminClient();

    // com_m_word を inner join して content_id で絞り込む
    const { data, error } = await supabase
      .from('com_m_phrase')
      .select(`
        *,
        com_m_word!inner(content_id)
      `)
      .eq('com_m_word.content_id', contentId)
      .order('word_id', { ascending: true })
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error('phrase:get_phrases_by_content_id_failed', error.message, { contentId });
      return [];
    }

    return data as PhraseRecord[];
  } catch (err) {
    logger.error('phrase:get_phrases_by_content_id_unexpected', err instanceof Error ? err.message : 'Unknown error', { contentId });
    return [];
  }
}