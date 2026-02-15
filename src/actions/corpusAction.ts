"use server";

import { createClient } from "@/lib/server";
import { CorpusRecord } from "@/types/corpus";
import { FavoritePhraseRecord, RawFavoriteResponse, TrainingResponse, TrainingWord } from "@/types/training";

/**
 * 指定されたコーパスIDに紐付く単語とフレーズを取得
 */
export async function getTrainingData(corpusId: string): Promise<TrainingResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('com_m_word')
    .select(`
      word_id,
      word_en,
      word_ja,
      com_m_corpus ( corpus_name ),
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
    .eq('com_m_phrase.com_t_favorite_phrase.user_id', user?.id)
    .order('frequency_rank', { ascending: true })
    .order('seq_no', { referencedTable: 'com_m_phrase', ascending: true });

  if (error) {
    console.error("Supabase Error Detail:", error);
    throw new Error(`取得失敗: ${error.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any[];

  // コーパス名の取得ロジックを修正
  // Supabaseの結合は[ { corpus_name: 'xxx' } ]のように配列で返ってくることが多いため
  const firstItem = rawData[0];
  let corpusName = 'Training';
  
  if (firstItem?.com_m_corpus) {
    corpusName = Array.isArray(firstItem.com_m_corpus) 
      ? firstItem.com_m_corpus[0]?.corpus_name 
      : firstItem.com_m_corpus?.corpus_name;
  }

  const words: TrainingWord[] = rawData.map((word) => ({
    word_id: word.word_id,
    word_en: word.word_en,
    word_ja: word.word_ja,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    phrases: word.com_m_phrase.map((p: any) => ({
      ...p,
      is_favorite_initial: Array.isArray(p.com_t_favorite_phrase) && p.com_t_favorite_phrase.length > 0 
    }))
  }));

  // Promise<TrainingResponse> に合致するように返却
  return { words, corpusName: corpusName || 'Training' };
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
          word_en,
          com_m_corpus (
            corpus_id,
            corpus_name
          )
        )
      )
    `)
    .order('insert_date', { ascending: false });

  if (error) {
    console.error("Supabase Error Detail:", error);
    throw new Error(`取得失敗: ${error.message}`);
  }
  
  // ここでフラットな形に変換する
    return (data as unknown as RawFavoriteResponse[]).map(item => ({
      favorite_id: item.favorite_id,
      phrase_id: item.phrase_id,
      phrase_en: item.com_m_phrase.phrase_en,
      phrase_ja: item.com_m_phrase.phrase_ja,
      word_en: item.com_m_phrase.com_m_word.word_en,
      corpus_id: item.com_m_phrase.com_m_word.com_m_corpus.corpus_id,
      corpus_name: item.com_m_phrase.com_m_word.com_m_corpus.corpus_name,
      insert_date: item.insert_date
    }));
}

// 全コーパスを取得
export async function getAllCorpus(): Promise<CorpusRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('com_m_corpus')
    .select(`
      *,
      is_favorite:com_t_favorite_corpus(count)
    `)
    .eq('delete_flg', '0')
    .order('seq_no', { ascending: true });

  if (error) {
    console.error("Fetch Error:", error);
    return [];
  }

  // countをbooleanに変換し、全体をCorpusRecord[]として扱う
  return (data || []).map(c => ({
    ...c,
    is_favorite: c.is_favorite[0]?.count > 0,
    // metadataはDBからJSONとして返るのでそのまま渡す
  })) as unknown as CorpusRecord[];
}

/**
 * コーパス（教材）のお気に入り状態を切り替え
 */
export async function toggleCorpusFavorite(corpusId: string, isFavorite: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  if (isFavorite) {
    // お気に入り登録
    await supabase
      .from('com_t_favorite_corpus')
      .upsert({ user_id: user.id, corpus_id: corpusId });
  } else {
    // 解除
    await supabase
      .from('com_t_favorite_corpus')
      .delete()
      .match({ user_id: user.id, corpus_id: corpusId });
  }
}
