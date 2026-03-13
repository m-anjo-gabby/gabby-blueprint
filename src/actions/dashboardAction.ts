"use server";

import { createClient } from "@/lib//server";
import { ContentRecord } from "@/types/content";

export interface ClientInfo {
  client_name: string;
  logo_url: string | null;
  dashboard_title: string | null;
}

/**
 * ダッシュボード用の軽量な教材リスト取得
 * 「お気に入り」と「おすすめ」に特化したデータを返します
 */
export async function getDashboardContentData(): Promise<ContentRecord[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('com_m_contents')
    .select(`
      *,
      is_favorite:com_t_favorite_contents(count)
    `)
    .eq('delete_flg', '0')
    // 条件：おすすめ(recommend > 0) または RLSで許可されたもの
    // 実際にはRLSでフィルタされるため、ここでは表示優先度順に取得
    .order('recommend', { ascending: false })
    .order('seq_no', { ascending: true });

  if (error) {
    console.error("Fetch Dashboard Content Error:", error.message);
    return [];
  }

  // countをbooleanに変換
  return (data || []).map(c => ({
    ...c,
    is_favorite: c.is_favorite?.[0]?.count > 0
  })) as unknown as ContentRecord[];
}

/**
 * ログインユーザーの所属クライアント情報を取得
 * RLSにより、所属クライアントに許可されたもののみが自動的に返ります
 */
export async function getMyClientInfo(): Promise<ClientInfo | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('com_m_client')
    .select('*')
    .single(); // 自分の所属は1つなのでsingleで取得

  if (error) return null;
  return data;
}