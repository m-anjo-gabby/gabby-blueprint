"use server";

import { createClient } from "@/lib//server";

// 型定義（インターフェース）
export interface CorpusRecord {
  corpus_id: string; // BigIntはSupabaseから文字列として返る
  corpus_name: string;
  description: string;
  corpus_label: string;
  seq_no: number;
  insert_date: string;
}

/**
 * 顧客に関連付けられたコーパス一覧を取得
 */
export async function getClientCorpusList(clientId: number): Promise<CorpusRecord[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('com_m_corpus')
    .select(`
      corpus_id,
      corpus_name,
      description,
      corpus_label,
      seq_no,
      insert_date
    `)
    .eq('client_id', clientId)
    .eq('delete_flg', '0')
    .order('seq_no', { ascending: true });

  if (error) {
    console.error("Fetch Corpus Error:", error.message);
    throw new Error("コーパス情報の取得に失敗しました。");
  }

  // 型をキャストして返却（ここで型を確定させる）
  return data as unknown as CorpusRecord[];
}

/**
 * ダッシュボード用：各コーパスの単語数などの統計情報を取得
 */
export async function getCorpusStats(clientId: number) {
  const supabase = await createClient();

  // コーパスごとの単語数を集計して取得
  // com_m_word と com_m_corpus を結合
  const { data, error } = await supabase
    .from('com_m_corpus')
    .select(`
      corpus_id,
      corpus_name,
      com_m_word (count)
    `)
    .eq('client_id', clientId)
    .eq('delete_flg', '0')
    .eq('com_m_word.delete_flg', '0');

  if (error) {
    console.error("Fetch Stats Error:", error.message);
    throw new Error("統計情報の取得に失敗しました。");
  }

  // countを扱いやすい数値形式に整形して返却
  return data.map(item => ({
    id: item.corpus_id,
    name: item.corpus_name,
    wordCount: item.com_m_word[0]?.count ?? 0
  }));
}
