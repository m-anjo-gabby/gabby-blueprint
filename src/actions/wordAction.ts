"use server";

import { createClient } from "@/lib/server";
import { FavoritePhraseRecord, FavoriteResponse, TrainingWord, TrainingWordResponse } from "@/types/word";

/**
 * 指定されたコンテンツIDに紐付く単語とフレーズを取得
 */
export async function getWordData(contentId: string): Promise<TrainingWordResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('com_m_word')
    .select(`
      word_id,
      word_en,
      word_ja,
      status,
      com_m_contents ( content_name ),
      com_m_phrase (
        phrase_id,
        phrase_en,
        phrase_ja,
        phrase_type,
        seq_no,
        status,
        tts_status,
        com_t_favorite_phrase ( phrase_id )
      )
    `)
    .eq('content_id', contentId)
    .eq('status', 'live')
    .eq('com_m_phrase.status', 'live')
    .eq('com_m_phrase.com_t_favorite_phrase.user_id', user?.id)
    .order('frequency_rank', { ascending: true })
    .order('seq_no', { referencedTable: 'com_m_phrase', ascending: true });

  if (error) {
    console.error("Supabase Error Detail:", error);
    throw new Error(`取得失敗: ${error.message}`);
  }

  const rawData = data as any[];
  const firstItem = rawData[0];
  let contentName = 'Training';
  
  if (firstItem?.com_m_contents) {
    contentName = Array.isArray(firstItem.com_m_contents) 
      ? firstItem.com_m_contents[0]?.content_name 
      : firstItem.com_m_contents?.content_name;
  }

  // TrainingWord[] 型に準拠するようにマッピング
  const words: TrainingWord[] = rawData.map((word) => ({
    word_id: word.word_id,
    word_en: word.word_en,
    word_ja: word.word_ja,
    status: word.status, // 追加
    phrases: word.com_m_phrase.map((p: any) => ({
      phrase_id: p.phrase_id,
      phrase_en: p.phrase_en,
      phrase_ja: p.phrase_ja,
      phrase_type: p.phrase_type,
      seq_no: p.seq_no,
      status: p.status,         // 追加
      tts_status: p.tts_status, // 追加
      is_favorite_initial: Array.isArray(p.com_t_favorite_phrase) && p.com_t_favorite_phrase.length > 0 
    }))
  }));

  // Promise<TrainingResponse> に合致するように返却
  return { words, contentName: contentName || 'Training' };
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
  
  // ユーザーIDを取得して確実に絞り込む
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('com_t_favorite_phrase')
    .select(`
      favorite_id,
      phrase_id,
      insert_date,
      com_m_phrase!inner (
        phrase_en,
        phrase_ja,
        com_m_word!inner (
          word_en,
          com_m_contents!inner (
            content_id,
            content_name
          )
        )
      )
    `)
    .eq('user_id', user.id) // 自分のデータのみに絞り込み
    .order('insert_date', { ascending: false });

  if (error) {
    console.error("Supabase Error Detail:", error);
    throw new Error(`取得失敗: ${error.message}`);
  }

  return (data as unknown as FavoriteResponse[]).map(item => ({
    // 一意なキーとして favorite_id を保持
    favorite_id: item.favorite_id,
    phrase_id: item.phrase_id,
    phrase_en: item.com_m_phrase.phrase_en,
    phrase_ja: item.com_m_phrase.phrase_ja,
    word_en: item.com_m_phrase.com_m_word.word_en,
    content_id: item.com_m_phrase.com_m_word.com_m_contents.content_id,
    content_name: item.com_m_phrase.com_m_word.com_m_contents.content_name,
    insert_date: item.insert_date,
    is_favorite: true
  }));
}