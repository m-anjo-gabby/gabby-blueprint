"use server";

import { createClient } from "@/lib//server";

// 型定義（インターフェース）
export interface CorpusRecord {
  corpus_id: string;
  corpus_name: string;
  description: string;
  corpus_label: string;
  seq_no: number;
  insert_date: string;
}

/**
 * ログインユーザーがアクセス可能なコーパス一覧を取得
 * RLSにより、共通(type=0)および所属クライアントに許可されたもののみが自動的に返ります
 */
export async function getClientCorpusList(): Promise<CorpusRecord[]> {
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
    // RLSが効いているため、.eq('client_id', ...) は不要
    .eq('delete_flg', '0')
    .order('seq_no', { ascending: true });

  if (error) {
    console.error("Fetch Corpus Error:", error.message);
    throw new Error("コーパス情報の取得に失敗しました。");
  }

  return data as unknown as CorpusRecord[];
}