"use server";

import { createClient } from "@/lib/server";
import { CorpusRecord, FavoriteCorpusRecord } from "@/types/corpus";
import { BaseResumeMetadata, ResumeCorpusResponse } from "@/types/training";

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

// お気に入りコーパスを取得
// actions/corpusAction.ts

export async function getFavoriteCorpuses(): Promise<FavoriteCorpusRecord[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('com_t_favorite_corpus')
    .select(`
      corpus:com_m_corpus!inner(*)
    `)
    .eq('user_id', user.id)
    .eq('com_m_corpus.delete_flg', '0')
    .order('seq_no', { referencedTable: 'com_m_corpus', ascending: true });

  if (error || !data) {
    console.error("Fetch Error:", error);
    return [];
  }

  // d.corpus は FavoriteCorpusRecord から is_favorite を除いたものと一致するはずです
  return data.map(d => {
    const corpus = d.corpus as unknown as FavoriteCorpusRecord;
    return {
      ...corpus,
      is_favorite: true,
    };
  });
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

/**
 * コーパスの再開地点を保存する (栞を挟む)
 * T は BaseResumeMetadata を継承した具体的なメタデータ型
 */
export async function saveResumeCorpus<T extends BaseResumeMetadata>(
  corpusId: string, 
  itemId: string, 
  metadata: T
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from('com_t_resume_corpus')
    .upsert({
      user_id: user.id,
      corpus_id: corpusId,
      item_id: itemId,
      metadata: metadata, // metadataフィールドはJSONBなので型安全に保存可能
      update_date: new Date().toISOString()
    });

  if (error) {
    console.error("Save resume corpus error:", error);
    throw new Error(`栞の保存に失敗しました: ${error.message}`);
  }
}

/**
 * 再開地点を削除する (栞を抜く)
 */
export async function clearResumeCorpus() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from('com_t_resume_corpus')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    console.error("Clear resume corpus error:", error);
    throw new Error(`栞の削除に失敗しました: ${error.message}`);
  }
}

/**
 * 最新の再開地点を取得する
 * 呼び出し側で const data = await getLatestResumeCorpus<WordResumeMetadata>(); のように利用可能
 */
export async function getLatestResumeCorpus<T = BaseResumeMetadata>() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('com_t_resume_corpus')
    .select(`
      corpus_id,
      item_id,
      metadata,
      com_m_corpus (
        corpus_name,
        corpus_type,
        difficulty_level,
        corpus_label
      )
    `)
    .eq('user_id', user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // 0件（レコードなし）は正常系として扱う
    console.error("Fetch resume corpus error:", error);
    return null;
  }

  // 取得したデータを定義したジェネリクス型へアサーション
  return data as unknown as ResumeCorpusResponse<T>;
}