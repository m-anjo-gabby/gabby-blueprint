"use server";

import { createClient } from "@/lib/server";
import { TrainingWord } from "@/types/training";

// 1. DBから返ってくる生のデータ構造を定義
interface RawPhraseResponse {
  phrase_id: string;
  phrase_en: string;
  phrase_ja: string;
  phrase_type: number;
  seq_no: number;
}

interface RawWordResponse {
  word_id: string;
  word_en: string;
  word_ja: string;
  com_m_phrase: RawPhraseResponse[];
}

export interface FavoritePhraseRecord {
  favorite_id: string;
  phrase_id: string;
  phrase_en: string;
  phrase_ja: string;
  word_en: string; // どの単語のフレーズか分かると親切
  insert_date: string;
}

/**
 * 指定されたコーパスIDに紐付く単語とフレーズを取得
 */
export async function getTrainingData(corpusId: string): Promise<TrainingWord[]> {
  const supabase = await createClient();

  // selectの型推論を助けるため、RawWordResponse[] として扱う
  // 子テーブル(com_m_phrase)のソートもselect内で指定可能です
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
        seq_no
      )
    `)
    .eq('corpus_id', corpusId)
    .eq('delete_flg', '0')
    .eq('com_m_phrase.delete_flg', '0') // フレーズ側の削除フラグも考慮
    .order('frequency_rank', { ascending: true }) // com_m_wordのソート
    .order('seq_no', { referencedTable: 'com_m_phrase', ascending: true }); // com_m_phraseのソート

  if (error) {
    console.error("DB Fetch Error:", error.message);
    throw new Error("トレーニングデータの取得に失敗しました。");
  }

  // data を一度 unknown を経由して RawWordResponse[] にキャスト
  const rawData = data as unknown as RawWordResponse[];

  // 3. any を使わずにマッピング
  return rawData.map((word) => ({
    word_id: word.word_id,
    word_en: word.word_en,
    word_ja: word.word_ja,
    // com_m_phrase が配列であることを保証しつつソート
    phrases: [...(word.com_m_phrase || [])].sort((a, b) => a.seq_no - b.seq_no)
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

  if (error) throw new Error(error.message);
  
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