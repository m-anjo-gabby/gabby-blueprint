'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { PhraseRecord } from '@gabby/types/word'; // 定義した Record 型
import { revalidatePath } from 'next/cache';

/**
 * 特定の単語に紐づくフレーズ一覧を取得する
 */
export async function getPhrasesByWordId(wordId: string): Promise<PhraseRecord[]> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from('com_m_phrase')
      .select('*')
      .eq('word_id', wordId)
      .eq('delete_flg', '0')
      .order('seq_no', { ascending: true }); // SEQ順に並べる

    if (error) {
      console.error('Error fetching phrases:', error);
      return [];
    }

    return data as PhraseRecord[];
  } catch (err) {
    console.error('System error:', err);
    return [];
  }
}

/**
 * フレーズの新規作成
 */
export async function createPhrase(wordId: string, seqNo: number) {
  const supabase = createAdminClient();

  try {
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
      console.error('Create phrase error:', error);
      return { success: false, message: error.message };
    }

    return { success: true, data: data as PhraseRecord };
  } catch (err) {
    return { success: false, message: 'システムエラーが発生しました' };
  }
}

/**
 * フレーズの更新 (インライン編集 & ステータス自動変更)
 */
export async function updatePhrase(
  phraseId: string,
  updates: Partial<Pick<PhraseRecord, 'phrase_en' | 'phrase_ja' | 'phrase_type' | 'seq_no' | 'tts_ssml'>>
) {
  const supabase = createAdminClient();

  // 英文(phrase_en)またはSSMLが変更された場合のみ、ステータスを「要更新(2)」にする
  const isAudioAffected = 'phrase_en' in updates || 'tts_ssml' in updates;
  
  const dataToUpdate = {
    ...updates,
    update_date: new Date().toISOString(),
    ...(isAudioAffected ? { tts_status: 2 } : {})
  };

  try {
    const { data, error } = await supabase
      .from('com_m_phrase')
      .update(dataToUpdate)
      .eq('phrase_id', phraseId)
      .select()
      .single();

    if (error) {
      console.error('Update phrase error:', error);
      return { success: false, message: error.message };
    }

    return { success: true, data: data as PhraseRecord };
  } catch (err) {
    return { success: false, message: 'システムエラーが発生しました' };
  }
}

/**
 * フレーズの論理削除
 */
export async function deletePhrase(phraseId: string) {
  const supabase = createAdminClient();

  try {
    const { error } = await supabase
      .from('com_m_phrase')
      .update({ 
        delete_flg: '1',
        update_date: new Date().toISOString() 
      })
      .eq('phrase_id', phraseId);

    if (error) {
      console.error('Delete phrase error:', error);
      return { success: false, message: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, message: 'システムエラーが発生しました' };
  }
}

/**
 * 特定のコンテンツに紐づくすべてのフレーズを（単語を跨いで）取得する
 */
export async function getPhrasesByContentId(contentId: string): Promise<PhraseRecord[]> {
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
    console.error('Error fetching phrases by content:', error);
    return [];
  }

  return data as PhraseRecord[];
}