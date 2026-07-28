// apps/admin/actions/adminDashboardAction.ts
'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger, getLogContext } from '@gabby/lib/logger';

const logger = createLogger('admin');

export type DashboardModuleKey = 'clients' | 'contracts' | 'users' | 'contents' | 'notice';

export interface DashboardModuleSummary {
  key: DashboardModuleKey;
  count: number;
  countLabel: string;
  alertCount: number;
  alertLabel: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// 'use server' ファイルは非同期関数以外を export できないため、既定の表示順はここではエクスポートしない
// （呼び出し側で使う表示順は _components/moduleConfig.ts の DASHBOARD_MODULE_ORDER を参照）
const DEFAULT_MODULE_ORDER: DashboardModuleKey[] = ['clients', 'contracts', 'users', 'contents', 'notice'];

/**
 * ダッシュボードの各モジュールサマリー（件数・要対応件数）を取得する。
 * 1モジュールの取得に失敗しても他モジュールの表示は継続させるため、個別に握りつぶしてゼロ件を返す。
 * allowedKeys を渡した場合、権限のないモジュールのクエリ自体を発行しない（サイドバーの表示権限と揃える）。
 */
export async function getDashboardSummary(allowedKeys?: DashboardModuleKey[]): Promise<DashboardModuleSummary[]> {
  const keys = allowedKeys && allowedKeys.length > 0 ? allowedKeys : DEFAULT_MODULE_ORDER;
  const supabase = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + THIRTY_DAYS_MS).toISOString();

  const fetchers: Record<DashboardModuleKey, () => Promise<DashboardModuleSummary>> = {
    clients: () => getClientsSummary(supabase, nowIso),
    contracts: () => getContractsSummary(supabase, soonIso),
    users: () => getUsersSummary(supabase),
    contents: () => getContentsSummary(supabase),
    notice: () => getNoticeSummary(supabase, nowIso),
  };

  return Promise.all(keys.map((key) => fetchers[key]()));
}

async function getClientsSummary(supabase: ReturnType<typeof createAdminClient>, nowIso: string): Promise<DashboardModuleSummary> {
  const ctx = await getLogContext();
  try {
    const { count: totalCount, error: totalError } = await supabase
      .from('com_m_client')
      .select('*', { count: 'exact', head: true })
      .eq('delete_flg', '0');

    if (totalError) throw totalError;

    // 有効な契約(status=1 かつ 契約終了日が未来)を持つ顧客IDの集合を求め、差分を「契約なし顧客」とする
    const { data: activeContracts, error: contractError } = await supabase
      .from('vw_contract_details')
      .select('client_id')
      .eq('status', 1)
      .gte('end_date', nowIso);

    if (contractError) throw contractError;

    const activeClientIds = new Set((activeContracts || []).map((c) => c.client_id));
    const alertCount = Math.max((totalCount || 0) - activeClientIds.size, 0);

    return {
      key: 'clients',
      count: totalCount || 0,
      countLabel: '登録顧客数',
      alertCount,
      alertLabel: '有効契約なし',
    };
  } catch (error) {
    logger.error('dashboard:get_clients_summary_failed', error instanceof Error ? error.message : 'Unknown error', ctx);
    return { key: 'clients', count: 0, countLabel: '登録顧客数', alertCount: 0, alertLabel: '有効契約なし' };
  }
}

async function getContractsSummary(supabase: ReturnType<typeof createAdminClient>, soonIso: string): Promise<DashboardModuleSummary> {
  const ctx = await getLogContext();
  try {
    // 稼働中判定・期限切迫判定・ライセンス超過判定をまとめて行うため、有効契約(status=1)の必要カラムのみ取得
    const { data: activeContracts, error } = await supabase
      .from('vw_contract_details')
      .select('contract_id, end_date, max_licenses, current_assigned_count')
      .eq('status', 1);

    if (error) throw error;

    const alertIds = new Set<string>();
    (activeContracts || []).forEach((c) => {
      const isExpiringSoon = c.end_date && c.end_date <= soonIso;
      const isOverAllocated = (c.current_assigned_count || 0) > (c.max_licenses || 0);
      if (isExpiringSoon || isOverAllocated) alertIds.add(c.contract_id);
    });

    return {
      key: 'contracts',
      count: activeContracts?.length || 0,
      countLabel: '稼働中の契約',
      alertCount: alertIds.size,
      alertLabel: '期限間近・超過契約',
    };
  } catch (error) {
    logger.error('dashboard:get_contracts_summary_failed', error instanceof Error ? error.message : 'Unknown error', ctx);
    return { key: 'contracts', count: 0, countLabel: '稼働中の契約', alertCount: 0, alertLabel: '期限間近・超過契約' };
  }
}

async function getUsersSummary(supabase: ReturnType<typeof createAdminClient>): Promise<DashboardModuleSummary> {
  const ctx = await getLogContext();
  try {
    const { count: totalCount, error: totalError } = await supabase
      .schema('private')
      .from('vw_user_list')
      .select('*', { count: 'exact', head: true });

    if (totalError) throw totalError;

    const { count: pendingCount, error: pendingError } = await supabase
      .schema('private')
      .from('vw_user_list')
      .select('*', { count: 'exact', head: true })
      .in('license_state', ['inviting', 'expired_invite', 'mail_failed']);

    if (pendingError) throw pendingError;

    return {
      key: 'users',
      count: totalCount || 0,
      countLabel: '総ユーザー数',
      alertCount: pendingCount || 0,
      alertLabel: '招待対応待ち',
    };
  } catch (error) {
    logger.error('dashboard:get_users_summary_failed', error instanceof Error ? error.message : 'Unknown error', ctx);
    return { key: 'users', count: 0, countLabel: '総ユーザー数', alertCount: 0, alertLabel: '招待対応待ち' };
  }
}

async function getContentsSummary(supabase: ReturnType<typeof createAdminClient>): Promise<DashboardModuleSummary> {
  const ctx = await getLogContext();
  try {
    const { count: totalCount, error: totalError } = await supabase
      .from('com_m_contents')
      .select('*', { count: 'exact', head: true })
      .eq('delete_flg', '0');

    if (totalError) throw totalError;

    const { count: privateCount, error: privateError } = await supabase
      .from('com_m_contents')
      .select('*', { count: 'exact', head: true })
      .eq('delete_flg', '0')
      .eq('content_scope', 9);

    if (privateError) throw privateError;

    return {
      key: 'contents',
      count: totalCount || 0,
      countLabel: '登録教材数',
      alertCount: privateCount || 0,
      alertLabel: '非公開教材',
    };
  } catch (error) {
    logger.error('dashboard:get_contents_summary_failed', error instanceof Error ? error.message : 'Unknown error', ctx);
    return { key: 'contents', count: 0, countLabel: '登録教材数', alertCount: 0, alertLabel: '非公開教材' };
  }
}

async function getNoticeSummary(supabase: ReturnType<typeof createAdminClient>, nowIso: string): Promise<DashboardModuleSummary> {
  const ctx = await getLogContext();
  try {
    const { count: publishedCount, error: publishedError } = await supabase
      .from('com_m_notice')
      .select('*', { count: 'exact', head: true })
      .eq('delete_flg', '0')
      .eq('is_published', true);

    if (publishedError) throw publishedError;

    const { count: draftCount, error: draftError } = await supabase
      .from('com_m_notice')
      .select('*', { count: 'exact', head: true })
      .eq('delete_flg', '0')
      .eq('is_published', false);

    if (draftError) throw draftError;

    const { count: expiredButPublishedCount, error: expiredError } = await supabase
      .from('com_m_notice')
      .select('*', { count: 'exact', head: true })
      .eq('delete_flg', '0')
      .eq('is_published', true)
      .lt('expired_at', nowIso);

    if (expiredError) throw expiredError;

    return {
      key: 'notice',
      count: publishedCount || 0,
      countLabel: '公開中のお知らせ',
      alertCount: (draftCount || 0) + (expiredButPublishedCount || 0),
      alertLabel: '下書き・掲載期限切れ',
    };
  } catch (error) {
    logger.error('dashboard:get_notice_summary_failed', error instanceof Error ? error.message : 'Unknown error', ctx);
    return { key: 'notice', count: 0, countLabel: '公開中のお知らせ', alertCount: 0, alertLabel: '下書き・掲載期限切れ' };
  }
}