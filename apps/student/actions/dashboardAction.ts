"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { ContentItem } from "@gabby/types/content";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";
import { getAuthUser } from '@gabby/lib/supabase/authUser';

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
/** ホームの「ご契約プラン」に表示する契約（ライセンス）1件分 */
export interface MyPlan {
  license_id: string;
  /** 生徒に見せるプラン名（管理用の契約名 contract_name は使わない） */
  plan_name: string;
  start_date: string;
  end_date: string;
}

/**
 * ログインユーザーの有効な契約（利用中・開始前）を開始日の早い順に取得する。
 * 有効の条件はログイン時のライセンス確認（status=1 かつ終了日前）と同じ。
 * 本人のライセンスと所属クライアントの契約は RLS で参照できる。
 */
export async function getMyActivePlans(): Promise<MyPlan[]> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) throw new Error('Unauthorized');

    const { data, error } = await supabase
      .from('com_t_user_license')
      .select('license_id, start_date, end_date, com_m_contract!inner(plan_name)')
      .eq('user_id', user.id)
      .eq('status', 1)
      .gte('end_date', new Date().toISOString())
      .order('start_date', { ascending: true });

    if (error) throw error;
    return (data ?? []).map((row) => ({
      license_id: row.license_id,
      // 多対一の結合のため実体は1件のオブジェクト（型生成なしのクライアントでは配列として推論される）
      plan_name: ([] as { plan_name: string }[]).concat(row.com_m_contract)[0]?.plan_name ?? '',
      start_date: row.start_date,
      end_date: row.end_date,
    }));
  } catch (err) {
    // ホームの補助表示のため、失敗時は契約なしと同じ扱いにして画面全体は表示させる
    logger.error('dashboard:get_active_plans_failed', err instanceof Error ? err.message : String(err), ctx);
    return [];
  }
}
