"use server";

import { createClient } from "@/lib/server";
import { FavoritePhraseRecord, TrainingWord } from "@/types/training";

/**
 * 指定されたコーパスIDに紐付く単語とフレーズを取得（お気に入り状態付き）
 */
export async function getTrainingData(corpusId: string): Promise<TrainingWord[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); // ユーザーID取得

  const { data, error } = await supabase
    .from('com_m_word')
    .select(`
      word_id,
      word_en,
      word_ja,
      com_m_phrase (
        phrase_id,
        phrase_en,
        phrase_ja,
        phrase_type,
        seq_no,
        com_t_favorite_phrase ( phrase_id )
      )
    `)
    .eq('corpus_id', corpusId)
    .eq('delete_flg', '0')
    .eq('com_m_phrase.delete_flg', '0')
    .eq('com_m_phrase.com_t_favorite_phrase.user_id', user?.id) // 自分のデータのみ
    .order('frequency_rank', { ascending: true })
    .order('seq_no', { referencedTable: 'com_m_phrase', ascending: true });

  if (error) {
    console.error("Supabase Error Detail:", error);
    throw new Error(`取得失敗: ${error.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any[];

  return rawData.map((word) => ({
    word_id: word.word_id,
    word_en: word.word_en,
    word_ja: word.word_ja,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    phrases: word.com_m_phrase.map((p: any) => ({
      ...p,
      // お気に入りレコードが存在すれば true
      is_favorite_initial: Array.isArray(p.com_t_favorite_phrase) && p.com_t_favorite_phrase.length > 0 
    }))
  }));
}

/**
 * お気に入りの状態を切り替える (Toggle)
 */
export async function toggleFavorite(phraseId: string, isFavorite: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (isFavorite) {
    // 登録
    await supabase
      .from('com_t_favorite_phrase')
      .upsert({ user_id: user.id, phrase_id: phraseId });
  } else {
    // 解除
    await supabase
      .from('com_t_favorite_phrase')
      .delete()
      .eq('user_id', user.id)
      .eq('phrase_id', phraseId);
  }
}

/**
 * お気に入りの総数を取得
 */
export async function getFavoriteCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('com_t_favorite_phrase')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error("Supabase Error Detail:", error);
    throw new Error(`取得失敗: ${error.message}`);
  }

  return count || 0;
}

/**
 * お気に入りのフレーズ一覧を取得
 */
export async function getFavoritePhrases(): Promise<FavoritePhraseRecord[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('com_t_favorite_phrase')
    .select(`
      favorite_id,
      phrase_id,
      insert_date,
      com_m_phrase (
        phrase_en,
        phrase_ja,
        com_m_word (
          word_en
        )
      )
    `)
    .order('insert_date', { ascending: false });

  if (error) {
    console.error("Supabase Error Detail:", error);
    throw new Error(`取得失敗: ${error.message}`);
  }
  
  // ネストされたデータをフラットに整形
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(fav => ({
    favorite_id: fav.favorite_id,
    phrase_id: fav.phrase_id,
    phrase_en: fav.com_m_phrase.phrase_en,
    phrase_ja: fav.com_m_phrase.phrase_ja,
    word_en: fav.com_m_phrase.com_m_word.word_en,
    insert_date: fav.insert_date
  }));
}

