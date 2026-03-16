'use server';

import { createAdminClient } from "@/lib/admin";
import { WordRecord } from '@/types/word';
import { revalidatePath } from 'next/cache';

/**
 * 特定の教材に紐づく単語一覧を取得する
 * 登録順（insert_date）やアルファベット順（word_en）など、
 * 運用に合わせてオーダーを調整してください。
 */
export async function getWordsByContentId(contentId: string): Promise<WordRecord[]> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from('com_m_word')
      .select('*')
      .eq('content_id', contentId)
      .eq('delete_flg', '0')
      .order('insert_date', { ascending: true }); // 登録の古い順

    if (error) {
      console.error('Error fetching words:', error);
      return [];
    }

    return data as WordRecord[];
  } catch (err) {
    console.error('System error:', err);
    return [];
  }
}

/**
 * 単語の新規作成
 */
export async function createWord(contentId: string, wordEn: string, wordJa: string) {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from('com_m_word')
      .insert([
        {
          content_id: contentId,
          word_en: wordEn,
          word_ja: wordJa,
          delete_flg: '0',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Create word error:', error);
      return { success: false, message: error.message };
    }

    // エディタ画面のキャッシュを無効化
    revalidatePath(`/admin/contents/${contentId}`);
    
    return { success: true, data: data as WordRecord };
  } catch (err) {
    console.error('System error:', err);
    return { success: false, message: 'システムエラーが発生しました' };
  }
}

/**
 * 単語の論理削除
 * cascade制約により、com_m_phrase側のデータも物理削除または論理削除される前提です。
 * (DDLで ON DELETE CASCADE を設定している場合は物理削除されます)
 */
export async function deleteWord(wordId: string) {
  const supabase = createAdminClient();

  try {
    // 運用の要件に合わせて「物理削除」か「論理削除」か選んでください。
    // 今回は教材側のアクションに合わせて「論理削除」として実装します。
    const { error } = await supabase
      .from('com_m_word')
      .update({ 
        delete_flg: '1',
        update_date: new Date().toISOString() 
      })
      .eq('word_id', wordId);

    if (error) {
      console.error('Delete word error:', error);
      return { success: false, message: error.message };
    }

    // revalidatePath を呼ぶことで、画面上のリストを最新に保つ
    // ただし、クライアント側で state 管理している場合は state の filter も必要です
    return { success: true };
  } catch (err) {
    console.error('System error:', err);
    return { success: false, message: 'システムエラーが発生しました' };
  }
}

/**
 * 単語の更新 (インライン編集用)
 */
export async function updateWord(wordId: string, updates: Partial<Pick<WordRecord, 'word_en' | 'word_ja'>>) {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from('com_m_word')
      .update({
        ...updates,
        update_date: new Date().toISOString()
      })
      .eq('word_id', wordId)
      .select()
      .single();

    if (error) {
      console.error('Update word error:', error);
      return { success: false, message: error.message };
    }

    return { success: true, data: data as WordRecord };
  } catch (err) {
    console.error('System error:', err);
    return { success: false, message: 'システムエラーが発生しました' };
  }
}