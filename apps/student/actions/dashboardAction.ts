"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { ContentItem } from "@gabby/types/content";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";

const logger = createLogger('student');

export interface ClientInfo {
  client_name: string;
  logo_url: string | null;
  dashboard_title: string | null;
}

/**
 * ダッシュボード用の軽量な教材リスト取得
 * 「お気に入り」と「おすすめ」に特化したデータを返します
 */
export async function getDashboardContentData(): Promise<ContentItem[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    
    const { data, error } = await supabase
      .from('com_m_contents')
      .select(`
        *,
        is_favorite:com_t_favorite_contents(count)
      `)
      .eq('delete_flg', '0')
      .neq('content_scope', 9)
      // 条件：おすすめ(recommend > 0) または RLSで許可されたもの
      // 実際にはRLSでフィルタされるため、ここでは表示優先度順に取得
      .order('recommend', { ascending: false })
      .order('seq_no', { ascending: true });

    if (error) {
      logger.error("dashboard:get_content_failed", error.message, ctx);
      return [];
    }

    // countをbooleanに変換
    return (data || []).map(c => ({
      ...c,
      is_favorite: ((c.is_favorite as any)?.[0]?.count || 0) > 0
    })) as unknown as ContentItem[];
  } catch (err) {
    logger.error("dashboard:get_content_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return [];
  }
}

/**
 * ログインユーザーの所属クライアント情報を取得
 * RLSにより、所属クライアントに許可されたもののみが自動的に返ります
 */
export async function getMyClientInfo(): Promise<ClientInfo | null> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    
    const { data, error } = await supabase
      .from('com_m_client')
      .select('*')
      .single(); // 自分の所属は1つなのでsingleで取得

    if (error) {
      // 所属情報が見つからない、または複数ある場合（PGRST116: 0件, PGRST117: 複数件）
      // single()のエラーは、要件に応じて警告かエラーかを使い分ける
      if (error.code !== 'PGRST116') {
        logger.warn("dashboard:get_client_info_failed", error.message, ctx);
      }
      return null;
    }

    return data as ClientInfo;
  } catch (err) {
    logger.error("dashboard:get_client_info_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return null;
  }
}