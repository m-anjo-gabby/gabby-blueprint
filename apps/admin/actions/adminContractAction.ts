// apps/admin/actions/adminContractAction.ts
'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { formatToJstDate, getUtcRangeFromJstDate } from "@gabby/lib/date/date";
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';

const logger = createLogger('admin');

// x-user-id ヘッダーが取得できない特殊な文脈（'system'）ではUUID型カラムへの挿入に失敗するため、
// 有効なUUID形式の場合のみ history テーブルの performed_by に設定する
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function resolvePerformedBy(userId?: string): string | null {
  return userId && UUID_PATTERN.test(userId) ? userId : null;
}

interface LicenseHistoryEntry {
  license_id: string;
  contract_id: string;
  user_id: string;
  action: 'assigned' | 'updated' | 'removed';
  status: number;
  start_date: string;
  end_date: string;
  note?: string | null;
  performed_by: string | null;
}

/**
 * ライセンスの割当/更新/解除の履歴を記録する（追記専用・失敗しても主処理は継続させる）
 */
async function recordLicenseHistory(
  supabase: ReturnType<typeof createAdminClient>,
  entry: LicenseHistoryEntry,
  ctx: Awaited<ReturnType<typeof getLogContext>>
) {
  const { error } = await supabase.from('com_t_user_license_history').insert(entry);
  if (error) {
    // 履歴記録の失敗で本処理（割当/更新/解除）自体を失敗させない。ログにのみ残す。
    logger.error('contract:license_history_record_failed', error.message, { ...ctx, payload: entry });
  }
}

interface TicketHistoryEntry {
  ticket_id: string;
  contract_id: string;
  user_id: string;
  action: 'granted' | 'consumed' | 'restored' | 'removed';
  sessions_delta: number;
  used_sessions_after: number;
  total_sessions: number;
  note?: string | null;
  performed_by: string | null;
}

/**
 * ライブセッションチケットの発行/消化/復元/解除の履歴を記録する（追記専用・失敗しても主処理は継続させる）
 */
async function recordTicketHistory(
  supabase: ReturnType<typeof createAdminClient>,
  entry: TicketHistoryEntry,
  ctx: Awaited<ReturnType<typeof getLogContext>>
) {
  const { error } = await supabase.from('com_t_user_session_ticket_history').insert(entry);
  if (error) {
    logger.error('contract:ticket_history_record_failed', error.message, { ...ctx, payload: entry });
  }
}

/**
 * ライブセッションチケットを1件発行する（ライセンス割当に付随して呼び出す）。
 * チケット発行自体の失敗はライセンス割当を失敗させない（ログにのみ残す）。
 */
async function grantSessionTicket(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    license_id: string;
    contract_id: string;
    user_id: string;
    weekly_frequency: number;
    total_sessions: number;
    performed_by: string | null;
  },
  ctx: Awaited<ReturnType<typeof getLogContext>>
) {
  const { data: ticket, error } = await supabase
    .from('com_t_user_session_ticket')
    .insert({
      license_id: params.license_id,
      contract_id: params.contract_id,
      user_id: params.user_id,
      weekly_frequency: params.weekly_frequency,
      total_sessions: params.total_sessions,
    })
    .select('ticket_id, used_sessions, total_sessions')
    .single();

  if (error || !ticket) {
    logger.error('contract:grant_session_ticket_failed', error?.message || 'Ticket insert failed', { ...ctx, payload: params });
    return;
  }

  await recordTicketHistory(supabase, {
    ticket_id: ticket.ticket_id,
    contract_id: params.contract_id,
    user_id: params.user_id,
    action: 'granted',
    sessions_delta: ticket.total_sessions,
    used_sessions_after: ticket.used_sessions,
    total_sessions: ticket.total_sessions,
    performed_by: params.performed_by,
  }, ctx);
}

/**
 * ライセンス期間が契約期間内に収まっているかを検証する
 * （UI側の「ライセンスの有効期間は契約期間に準じます」という案内と実制御を一致させるため）
 */
function isWithinContractPeriod(
  licenseStartUtc: string,
  licenseEndUtc: string,
  contractStartUtc: string,
  contractEndUtc: string
): boolean {
  return (
    new Date(licenseStartUtc) >= new Date(contractStartUtc) &&
    new Date(licenseEndUtc) <= new Date(contractEndUtc)
  );
}

/**
 * 同一ユーザーに対して、指定期間と重複するライセンスが既に存在するかを確認する。
 * 生徒に複数ライセンスを付与する運用は「契約更新に伴う次タームへの切替」のみを想定しており、
 * 期間が重なるライセンスの重複付与（＝二重契約状態）を防止するための検証。
 * 更新時は自分自身のライセンス（excludeLicenseId）を比較対象から除外する。
 */
async function findOverlappingLicense(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  startUtc: string,
  endUtc: string,
  excludeLicenseId?: string
): Promise<{ start_date: string; end_date: string; plan_name: string } | null> {
  let query = supabase
    .from('com_t_user_license')
    .select('license_id, start_date, end_date, com_m_contract(plan_name)')
    .eq('user_id', userId)
    .lte('start_date', endUtc)
    .gte('end_date', startUtc)
    .limit(1);

  if (excludeLicenseId) {
    query = query.neq('license_id', excludeLicenseId);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) return null;

  const row = data[0] as unknown as {
    start_date: string;
    end_date: string;
    com_m_contract: { plan_name: string } | null;
  };
  return {
    start_date: row.start_date,
    end_date: row.end_date,
    plan_name: row.com_m_contract?.plan_name || '不明なプラン',
  };
}

function buildOverlapMessage(overlap: { start_date: string; end_date: string; plan_name: string }): string {
  return `このユーザーは既に期間が重なるライセンス「${overlap.plan_name}」（${formatToJstDate(overlap.start_date)}〜${formatToJstDate(overlap.end_date)}）を保有しているため割当できません`;
}

/**
 * 契約プランマスタの一覧取得（契約登録フォームの選択肢用）
 */
export async function getContractPlans() {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_contract_plan')
      .select('plan_id, plan_code, plan_name, contract_type, weekly_frequency, period_months, total_sessions')
      .eq('delete_flg', '0')
      .order('sort_no', { ascending: true });

    if (error) {
      logger.error('contract:get_contract_plans_failed', error.message, ctx);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('contract:get_contract_plans_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    return [];
  }
}

/**
 * 契約情報の一覧取得（ページネーション・検索対応）
 */
export async function getContracts(page: number = 1, limit: number = 10, searchQuery?: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('vw_contract_details')
      .select('*', { count: 'exact' });

    if (searchQuery) {
      query = query.ilike('client_name', `%${searchQuery}%`);
    }

    const { data: contracts, count, error } = await query
      .order('insert_date', { ascending: false })
      .range(from, to);

    if (error) {
      logger.error('contract:get_contracts_failed', error.message, { ...ctx, payload: { page, limit, searchQuery } });
      throw new Error(error.message);
    }

    const formattedContracts = (contracts || []).map(contract => ({
      ...contract,
      start_date: contract.start_date ? formatToJstDate(contract.start_date) : '',
      end_date: contract.end_date ? formatToJstDate(contract.end_date) : '',
    }));

    return {
      contracts: formattedContracts,
      totalCount: count || 0,
    };
  } catch (error) {
    logger.error('contract:get_contracts_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { page, limit, searchQuery } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * 特定顧客の「現在有効かつ枠がある」契約一覧を取得
 */
export async function getActiveContractsByClient(clientId: string, userId?: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    
    const { data: contracts, error } = await supabase
      .from('vw_contract_details')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 1)
      .gte('end_date', new Date().toISOString())
      .gt('remaining_licenses', 0)
      .order('plan_name', { ascending: true });

    if (error || !contracts) {
      logger.error('contract:get_active_contracts_failed', error?.message || 'No contracts found', { ...ctx, payload: { clientId, userId } });
      return [];
    }

    if (userId) {
      const { data: userLicenses } = await supabase
        .from('com_t_user_license')
        .select('contract_id, start_date, end_date')
        .eq('user_id', userId);

      const licenses = userLicenses || [];
      // 既存ライセンスと契約IDが同じ、または期間が重複する契約は選択肢から除外する
      // （生徒への複数ライセンス付与は契約更新に伴う次タームへの切替のみを想定しているため）
      const available = contracts.filter(c => !licenses.some(l =>
        l.contract_id === c.contract_id ||
        (new Date(l.start_date) <= new Date(c.end_date) && new Date(l.end_date) >= new Date(c.start_date))
      ));
      return formatContracts(available);
    }

    return formatContracts(contracts);
  } catch (error) {
    logger.error('contract:get_active_contracts_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { clientId, userId } });
    return [];
  }
}

function formatContracts(contracts: any[]) {
  return contracts.map(contract => ({
    ...contract,
    start_date: contract.start_date ? formatToJstDate(contract.start_date) : '',
    end_date: contract.end_date ? formatToJstDate(contract.end_date) : '',
  }));
}

/**
 * 契約情報の作成
 */
export async function createContract(params: {
  client_id: string;
  plan_name: string;
  max_licenses: number;
  start_date: string;
  end_date: string;
  note?: string | null;
  contract_type: number;
  plan_id?: string | null;
  weekly_frequency?: number | null;
  total_sessions?: number | null;
}) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { startUtc, endUtc } = getUtcRangeFromJstDate(params.start_date, params.end_date);
    const isLive = params.contract_type === 2;

    const { data, error } = await supabase
      .from('com_m_contract')
      .insert([
        {
          client_id: params.client_id,
          plan_name: params.plan_name,
          max_licenses: params.max_licenses,
          start_date: startUtc,
          end_date: endUtc,
          note: params.note || null,
          status: 1,
          contract_type: params.contract_type,
          plan_id: params.plan_id || null,
          weekly_frequency: isLive ? params.weekly_frequency : null,
          total_sessions: isLive ? params.total_sessions : null,
        }
      ])
      .select();

    if (error) {
      logger.error('contract:create_contract_failed', error.message, { ...ctx, payload: params });
      return { success: false, message: error.message };
    }

    const newContract = data[0];
    logger.info('contract:create_contract_success', `Contract created for client: ${params.client_id}`, { 
      ...ctx,
      payload: { contractId: newContract.contract_id, clientId: params.client_id } 
    });

    revalidatePath('/contracts');
    return { success: true, contract: newContract };
  } catch (error) {
    logger.error('contract:create_contract_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: params });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 契約情報の更新
 */
export async function updateContract(
  contractId: string,
  params: {
    client_id: string;
    plan_name: string;
    max_licenses: number;
    start_date: string;
    end_date: string;
    status: number;
    note?: string | null;
    contract_type: number;
    plan_id?: string | null;
    weekly_frequency?: number | null;
    total_sessions?: number | null;
  }
) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { startUtc, endUtc } = getUtcRangeFromJstDate(params.start_date, params.end_date);
    const isLive = params.contract_type === 2;

    // 契約期間の短縮・上限数の引き下げが、既存のライセンス発行実績と矛盾しないかを検証する
    // （UI上は「※超過」等の警告表示のみで書き込み自体は防げていなかったため）
    const { data: existingLicenses, error: licensesError } = await supabase
      .from('com_t_user_license')
      .select('license_id, start_date, end_date')
      .eq('contract_id', contractId);

    if (licensesError) {
      logger.error('contract:update_contract_licenses_lookup_failed', licensesError.message, { ...ctx, payload: { contractId } });
      return { success: false, message: '既存ライセンスの確認に失敗しました' };
    }

    const licenses = existingLicenses || [];

    if (licenses.length > params.max_licenses) {
      return { success: false, message: `既に${licenses.length}件のライセンスが割り当てられているため、上限をそれ未満に変更できません` };
    }

    const outOfRangeLicense = licenses.find(l =>
      new Date(l.start_date) < new Date(startUtc) || new Date(l.end_date) > new Date(endUtc)
    );
    if (outOfRangeLicense) {
      return { success: false, message: '既存のライセンス期間が新しい契約期間からはみ出すため、契約期間を変更できません（対象ライセンスの期間を先に調整してください）' };
    }

    const { data, error } = await supabase
      .from('com_m_contract')
      .update({
        client_id: params.client_id,
        plan_name: params.plan_name,
        max_licenses: params.max_licenses,
        start_date: startUtc,
        end_date: endUtc,
        status: params.status,
        note: params.note || null,
        contract_type: params.contract_type,
        plan_id: params.plan_id || null,
        weekly_frequency: isLive ? params.weekly_frequency : null,
        total_sessions: isLive ? params.total_sessions : null,
        update_date: new Date().toISOString(),
      })
      .eq('contract_id', contractId)
      .select();

    if (error) {
      logger.error('contract:update_contract_failed', error.message, { ...ctx, payload: { contractId, ...params } });
      return { success: false, message: error.message };
    }

    logger.info('contract:update_contract_success', `Contract updated`, { 
      ...ctx,
      payload: { contractId } 
    });

    revalidatePath('/contracts');
    return { success: true, contract: data[0] };
  } catch (error) {
    logger.error('contract:update_contract_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contractId, ...params } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 契約情報の削除（物理削除）
 * ライセンス発行実績（現在の割当）が一切ない契約に限り削除を許可する。
 * 過去に一度でも割当実績がある契約は、履歴テーブル（com_t_user_license_history等）に
 * 残る外部キー参照により、アプリ側のチェックをすり抜けてもDB制約(23503)で削除が拒否される。
 */
export async function deleteContract(contractId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { count, error: countError } = await supabase
      .from('com_t_user_license')
      .select('license_id', { count: 'exact', head: true })
      .eq('contract_id', contractId);

    if (countError) {
      logger.error('contract:delete_contract_count_failed', countError.message, { ...ctx, payload: { contractId } });
      return { success: false, message: '契約情報の確認に失敗しました' };
    }

    if ((count || 0) > 0) {
      return { success: false, message: 'ライセンスが割り当てられているため削除できません' };
    }

    const { error } = await supabase
      .from('com_m_contract')
      .delete()
      .eq('contract_id', contractId);

    if (error) {
      if (error.code === '23503') {
        return {
          success: false,
          message: '過去にライセンス発行の実績があるため、この契約は削除できません',
          reason: 'has_history' as const,
        };
      }
      logger.error('contract:delete_contract_failed', error.message, { ...ctx, payload: { contractId } });
      return { success: false, message: error.message };
    }

    logger.info('contract:delete_contract_success', 'Contract deleted', { ...ctx, payload: { contractId } });

    revalidatePath('/contracts');
    return { success: true };
  } catch (error) {
    logger.error('contract:delete_contract_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contractId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 契約の完全削除（履歴含む・検証用契約の後片付け専用）
 * 通常の deleteContract とは異なり、割当実績・履歴があっても物理削除する。
 * 監査ログ（誰がいつライセンスを割当/解除したか）ごと復元不能に失われるため、
 * 実運用契約には絶対に使用しないこと。呼び出し元では、通常の削除ボタンとは
 * 別の強い確認UI（対象名の入力等）を経由させる。
 */
export async function purgeContractWithHistory(contractId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    // DB側の履歴は本処理で失われるため、削除前の件数だけはアプリログに残しておく
    const [licenseCount, licenseHistoryCount, ticketHistoryCount] = await Promise.all([
      supabase.from('com_t_user_license').select('license_id', { count: 'exact', head: true }).eq('contract_id', contractId),
      supabase.from('com_t_user_license_history').select('history_id', { count: 'exact', head: true }).eq('contract_id', contractId),
      supabase.from('com_t_user_session_ticket_history').select('history_id', { count: 'exact', head: true }).eq('contract_id', contractId),
    ]);

    logger.warn('contract:purge_contract_with_history_start', 'Purging contract including assignment/license history (irreversible)', {
      ...ctx,
      payload: {
        contractId,
        currentLicenseCount: licenseCount.count || 0,
        licenseHistoryCount: licenseHistoryCount.count || 0,
        ticketHistoryCount: ticketHistoryCount.count || 0,
      },
    });

    const { error } = await supabase.rpc('purge_contract_with_history', { p_contract_id: contractId });

    if (error) {
      logger.error('contract:purge_contract_with_history_failed', error.message, { ...ctx, payload: { contractId } });
      return { success: false, message: error.message };
    }

    logger.warn('contract:purge_contract_with_history_success', 'Contract purged including history', { ...ctx, payload: { contractId } });

    revalidatePath('/contracts');
    revalidatePath('/users');
    return { success: true };
  } catch (error) {
    logger.error('contract:purge_contract_with_history_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contractId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * ライセンス割当用のユーザーリスト取得
 */
export async function getLicenseAssignmentUsers(contractId: string, clientId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: allUsers, error: userError } = await supabase
      .schema('private')
      .from('vw_user_list')
      .select('id, user_name, email, license_id')
      .eq('client_id', clientId)
      .eq('user_type', 1);

    if (userError) {
      logger.error('contract:get_license_assignment_users_view_failed', userError.message, { ...ctx, payload: { contractId, clientId } });
      throw new Error("ユーザーデータの取得に失敗しました");
    }

    const { data: currentAssignments, error: assignError } = await supabase
      .from('com_t_user_license')
      .select('user_id')
      .eq('contract_id', contractId);

    if (assignError) {
      logger.error('contract:get_license_assignment_users_assignments_failed', assignError.message, { ...ctx, payload: { contractId, clientId } });
      throw new Error("割当情報の取得に失敗しました");
    }

    const assignedUserIds = new Set((currentAssignments || []).map(a => a.user_id));

    // ライブセッション付き契約の場合、割当済みユーザーのチケット消化状況を合わせて取得する
    const { data: tickets } = await supabase
      .from('com_t_user_session_ticket')
      .select('user_id, used_sessions, total_sessions')
      .eq('contract_id', contractId);

    const ticketByUserId = new Map((tickets || []).map(t => [t.user_id, { used_sessions: t.used_sessions, total_sessions: t.total_sessions }]));

    return {
      assignedUsers: (allUsers || [])
        .filter(u => assignedUserIds.has(u.id))
        .map(u => ({ ...u, ticket: ticketByUserId.get(u.id) ?? null })),
      unassignedUsers: (allUsers || []).filter(u => !assignedUserIds.has(u.id)),
    };
  } catch (error) {
    logger.error('contract:get_license_assignment_users_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contractId, clientId } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * ライセンスの個別追加
 */
export async function assignLicenseToUser(
  contractId: string,
  userId: string,
  startDateJst: string,
  endDateJst: string
) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { startUtc, endUtc } = getUtcRangeFromJstDate(startDateJst, endDateJst);

    // 契約期間内に収まっているかを検証（UI表記「ライセンスの有効期間は契約期間に準じます」との整合）
    const { data: contract, error: contractError } = await supabase
      .from('com_m_contract')
      .select('start_date, end_date, contract_type, weekly_frequency, total_sessions, max_licenses')
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      logger.error('contract:assign_license_contract_lookup_failed', contractError?.message || 'Contract not found', { ...ctx, payload: { contractId } });
      return { success: false, message: '対象の契約情報が見つかりませんでした' };
    }

    if (!isWithinContractPeriod(startUtc, endUtc, contract.start_date, contract.end_date)) {
      return { success: false, message: 'ライセンス期間は契約期間内で指定してください' };
    }

    const overlap = await findOverlappingLicense(supabase, userId, startUtc, endUtc);
    if (overlap) {
      return { success: false, message: buildOverlapMessage(overlap) };
    }

    // UI側の上限チェック（isLicenseFull）は表示専用のため、書き込み直前に改めてサーバー側で検証する
    // （複数管理者による同時操作や複数タブでの多重実行時に上限を超過させないため）
    const { count: assignedCount, error: countError } = await supabase
      .from('com_t_user_license')
      .select('license_id', { count: 'exact', head: true })
      .eq('contract_id', contractId);

    if (countError) {
      logger.error('contract:assign_license_count_failed', countError.message, { ...ctx, payload: { contractId } });
      return { success: false, message: '割当状況の確認に失敗しました' };
    }

    if ((assignedCount || 0) >= contract.max_licenses) {
      return { success: false, message: '上限数に達しているため追加できません' };
    }

    const { data: inserted, error } = await supabase
      .from('com_t_user_license')
      .insert({
        contract_id: contractId,
        user_id: userId,
        status: 1,
        start_date: startUtc,
        end_date: endUtc,
      })
      .select('license_id, status, start_date, end_date, note')
      .single();

    if (error) {
      logger.error('contract:assign_license_failed', error.message, { ...ctx, payload: { contractId, userId, startDateJst, endDateJst } });
      return { success: false, message: error.message };
    }

    await recordLicenseHistory(supabase, {
      license_id: inserted.license_id,
      contract_id: contractId,
      user_id: userId,
      action: 'assigned',
      status: inserted.status,
      start_date: inserted.start_date,
      end_date: inserted.end_date,
      note: inserted.note,
      performed_by: resolvePerformedBy(ctx.userId),
    }, ctx);

    // ライブセッション付き契約の場合、ライセンスに1:1で紐づくチケットを発行する
    if (contract.contract_type === 2 && contract.weekly_frequency && contract.total_sessions) {
      await grantSessionTicket(supabase, {
        license_id: inserted.license_id,
        contract_id: contractId,
        user_id: userId,
        weekly_frequency: contract.weekly_frequency,
        total_sessions: contract.total_sessions,
        performed_by: resolvePerformedBy(ctx.userId),
      }, ctx);
    }

    logger.info('contract:assign_license_success', `License assigned to user`, {
      ...ctx,
      payload: { contractId, userId }
    });

    revalidatePath('/contracts');
    revalidatePath('/users');
    return { success: true };
  } catch (error) {
    logger.error('contract:assign_license_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contractId, userId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * ライセンスの個別解除（物理削除）
 */
export async function removeLicenseFromUser(contractId: string, userId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    // 物理削除で失われる情報を消す前に履歴としてスナップショットを残す
    const { data: existing } = await supabase
      .from('com_t_user_license')
      .select('license_id, status, start_date, end_date, note')
      .eq('contract_id', contractId)
      .eq('user_id', userId)
      .maybeSingle();

    // ライブセッション付き契約の場合、紐づくチケットも同様にスナップショットを残す
    // （ライセンス削除時にFK ON DELETE CASCADEでチケット本体は自動的に削除される）
    const { data: existingTicket } = existing
      ? await supabase
          .from('com_t_user_session_ticket')
          .select('ticket_id, used_sessions, total_sessions')
          .eq('license_id', existing.license_id)
          .maybeSingle()
      : { data: null };

    const { error } = await supabase
      .from('com_t_user_license')
      .delete()
      .eq('contract_id', contractId)
      .eq('user_id', userId);

    if (error) {
      logger.error('contract:remove_license_failed', error.message, { ...ctx, payload: { contractId, userId } });
      return { success: false, message: error.message };
    }

    if (existing) {
      await recordLicenseHistory(supabase, {
        license_id: existing.license_id,
        contract_id: contractId,
        user_id: userId,
        action: 'removed',
        status: existing.status,
        start_date: existing.start_date,
        end_date: existing.end_date,
        note: existing.note,
        performed_by: resolvePerformedBy(ctx.userId),
      }, ctx);
    }

    if (existingTicket) {
      await recordTicketHistory(supabase, {
        ticket_id: existingTicket.ticket_id,
        contract_id: contractId,
        user_id: userId,
        action: 'removed',
        sessions_delta: 0,
        used_sessions_after: existingTicket.used_sessions,
        total_sessions: existingTicket.total_sessions,
        performed_by: resolvePerformedBy(ctx.userId),
      }, ctx);
    }

    logger.info('contract:remove_license_success', `License removed from user`, {
      ...ctx,
      payload: { contractId, userId }
    });

    revalidatePath('/contracts');
    return { success: true };
  } catch (error) {
    logger.error('contract:remove_license_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contractId, userId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * ライセンス情報の個別更新
 */
export async function updateUserLicense(
  licenseId: string,
  updates: {
    start_date?: string;
    end_date?: string;
    status?: number;
    note?: string | null;
  }
) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    // 更新前スナップショットを取得（履歴記録・契約期間バリデーションの両方に使用）
    const { data: existing, error: existingError } = await supabase
      .from('com_t_user_license')
      .select('license_id, contract_id, user_id, status, start_date, end_date, note')
      .eq('license_id', licenseId)
      .single();

    if (existingError || !existing) {
      logger.error('contract:update_user_license_lookup_failed', existingError?.message || 'License not found', { ...ctx, payload: { licenseId } });
      return { success: false, message: '対象のライセンスが見つかりませんでした' };
    }

    const payload: any = { ...updates };

    if (updates.start_date || updates.end_date) {
      const tempStart = updates.start_date || "2000-01-01";
      const tempEnd = updates.end_date || "2099-12-31";
      const { startUtc, endUtc } = getUtcRangeFromJstDate(tempStart, tempEnd);
      if (updates.start_date) payload.start_date = startUtc;
      if (updates.end_date) payload.end_date = endUtc;
    }

    // 期間が変更される場合のみ、契約期間内に収まっているかを検証
    if (payload.start_date || payload.end_date) {
      const { data: contract, error: contractError } = await supabase
        .from('com_m_contract')
        .select('start_date, end_date')
        .eq('contract_id', existing.contract_id)
        .single();

      if (contractError || !contract) {
        logger.error('contract:update_user_license_contract_lookup_failed', contractError?.message || 'Contract not found', { ...ctx, payload: { licenseId } });
        return { success: false, message: '対象の契約情報が見つかりませんでした' };
      }

      const effectiveStart = payload.start_date || existing.start_date;
      const effectiveEnd = payload.end_date || existing.end_date;
      if (!isWithinContractPeriod(effectiveStart, effectiveEnd, contract.start_date, contract.end_date)) {
        return { success: false, message: 'ライセンス期間は契約期間内で指定してください' };
      }

      const overlap = await findOverlappingLicense(supabase, existing.user_id, effectiveStart, effectiveEnd, licenseId);
      if (overlap) {
        return { success: false, message: buildOverlapMessage(overlap) };
      }
    }

    const { error } = await supabase
      .from('com_t_user_license')
      .update({
        ...payload,
        update_date: new Date().toISOString(),
      })
      .eq('license_id', licenseId);

    if (error) {
      logger.error('contract:update_user_license_failed', error.message, { ...ctx, payload: { licenseId, updates } });
      return { success: false, message: error.message };
    }

    // 更新前の状態を履歴として記録（何から何に変わったかは insert_date の並びで追える）
    await recordLicenseHistory(supabase, {
      license_id: existing.license_id,
      contract_id: existing.contract_id,
      user_id: existing.user_id,
      action: 'updated',
      status: existing.status,
      start_date: existing.start_date,
      end_date: existing.end_date,
      note: existing.note,
      performed_by: resolvePerformedBy(ctx.userId),
    }, ctx);

    logger.info('contract:update_user_license_success', `User license updated`, {
      ...ctx,
      payload: { licenseId }
    });

    revalidatePath('/contracts');
    revalidatePath('/users');
    return { success: true };
  } catch (error) {
    logger.error('contract:update_user_license_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { licenseId, updates } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * ライセンスの一括割当
 */
export async function bulkAssignLicenses(
  contractId: string,
  userIds: string[],
  startDateJst: string,
  endDateJst: string
) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { startUtc, endUtc } = getUtcRangeFromJstDate(startDateJst, endDateJst);

    // 契約期間内に収まっているかを検証（個別割当と同じ制御を一括割当にも適用）
    const { data: contract, error: contractError } = await supabase
      .from('com_m_contract')
      .select('start_date, end_date, contract_type, weekly_frequency, total_sessions, max_licenses')
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      logger.error('contract:bulk_assign_licenses_contract_lookup_failed', contractError?.message || 'Contract not found', { ...ctx, payload: { contractId } });
      return { success: false, message: '対象の契約情報が見つかりませんでした', errorCount: userIds.length };
    }

    if (!isWithinContractPeriod(startUtc, endUtc, contract.start_date, contract.end_date)) {
      return { success: false, message: 'ライセンス期間は契約期間内で指定してください', errorCount: userIds.length };
    }

    // 期間が重複する既存ライセンスを持つユーザーは対象から除外する
    const overlapResults = await Promise.all(
      userIds.map(async userId => ({ userId, overlap: await findOverlappingLicense(supabase, userId, startUtc, endUtc) }))
    );
    const skippedForOverlap = overlapResults.filter(r => r.overlap).map(r => r.userId);
    let targetUserIds = overlapResults.filter(r => !r.overlap).map(r => r.userId);

    if (targetUserIds.length === 0) {
      return {
        success: false,
        message: '対象ユーザーは全員、期間が重複する既存のライセンスを保有しているため割当できません',
        errorCount: userIds.length,
        skippedForOverlap,
      };
    }

    // UI側の上限チェックは表示専用のため、書き込み直前に改めてサーバー側で上限を検証する
    const { count: assignedCount, error: countError } = await supabase
      .from('com_t_user_license')
      .select('license_id', { count: 'exact', head: true })
      .eq('contract_id', contractId);

    if (countError) {
      logger.error('contract:bulk_assign_licenses_count_failed', countError.message, { ...ctx, payload: { contractId } });
      return { success: false, message: '割当状況の確認に失敗しました', errorCount: userIds.length };
    }

    const remainingSlots = Math.max(contract.max_licenses - (assignedCount || 0), 0);
    const skippedForCapacity = targetUserIds.slice(remainingSlots);
    targetUserIds = targetUserIds.slice(0, remainingSlots);

    if (targetUserIds.length === 0) {
      return {
        success: false,
        message: '上限数に達しているため追加できません',
        errorCount: userIds.length,
        skippedForOverlap,
        skippedForCapacity,
      };
    }

    const insertData = targetUserIds.map(userId => ({
      contract_id: contractId,
      user_id: userId,
      status: 1,
      start_date: startUtc,
      end_date: endUtc,
    }));

    const { data, error } = await supabase
      .from('com_t_user_license')
      .insert(insertData)
      .select('license_id, user_id, status, start_date, end_date, note');

    if (error) {
      logger.error('contract:bulk_assign_licenses_failed', error.message, { ...ctx, payload: { contractId, userIds, startDateJst, endDateJst } });
      return { success: false, message: error.message, errorCount: userIds.length };
    }

    const performedBy = resolvePerformedBy(ctx.userId);
    await Promise.all((data || []).map(row => recordLicenseHistory(supabase, {
      license_id: row.license_id,
      contract_id: contractId,
      user_id: row.user_id,
      action: 'assigned',
      status: row.status,
      start_date: row.start_date,
      end_date: row.end_date,
      note: row.note,
      performed_by: performedBy,
    }, ctx)));

    // ライブセッション付き契約の場合、割当済みの各ライセンスにチケットを発行する
    if (contract.contract_type === 2 && contract.weekly_frequency && contract.total_sessions) {
      await Promise.all((data || []).map(row => grantSessionTicket(supabase, {
        license_id: row.license_id,
        contract_id: contractId,
        user_id: row.user_id,
        weekly_frequency: contract.weekly_frequency,
        total_sessions: contract.total_sessions,
        performed_by: performedBy,
      }, ctx)));
    }

    logger.info('contract:bulk_assign_licenses_success', `Bulk licenses assigned`, {
      ...ctx,
      payload: { contractId, count: data?.length || 0 }
    });

    revalidatePath('/users');
    revalidatePath('/contracts');

    return {
      success: true,
      successCount: data?.length || 0,
      assignedUserIds: (data || []).map(d => d.user_id),
      skippedForOverlap,
      skippedForCapacity,
    };
  } catch (error) {
    logger.error('contract:bulk_assign_licenses_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { contractId, userIds } });
    return { success: false, message: '予期せぬエラーが発生しました', errorCount: userIds.length };
  }
}

/**
 * ユーザーのライセンス履歴
 */
export async function getLicenseTimeline(userId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_t_user_license')
      .select(`
        *,
        com_m_contract (plan_name)
      `)
      .eq('user_id', userId)
      .order('start_date', { ascending: false });

    if (error) {
      logger.error('contract:get_license_timeline_failed', error.message, { ...ctx, payload: { userId } });
      throw error;
    }

    // 💡 解除済み（物理削除済み）のライセンスは履歴テーブル側から補完し、
    // 「解除すると履歴が消える」問題を解消する。現行のライセンス一覧の並び・形状には影響しない。
    const { data: removedHistory, error: historyError } = await supabase
      .from('com_t_user_license_history')
      .select(`
        license_id,
        contract_id,
        status,
        start_date,
        end_date,
        note,
        performed_at,
        com_m_contract (plan_name)
      `)
      .eq('user_id', userId)
      .eq('action', 'removed')
      .order('performed_at', { ascending: false });

    if (historyError) {
      logger.error('contract:get_license_removed_history_failed', historyError.message, { ...ctx, payload: { userId } });
    }

    const liveLicenses = (data || []).map(l => ({
      ...l,
      is_removed: false,
      start_date: formatToJstDate(l.start_date),
      end_date: formatToJstDate(l.end_date),
      plan_name: (l as any).com_m_contract?.plan_name || '不明なプラン'
    }));

    const removedLicenses = (removedHistory || []).map(h => ({
      license_id: h.license_id,
      contract_id: h.contract_id,
      status: h.status,
      note: h.note,
      is_removed: true,
      removed_at: h.performed_at,
      start_date: formatToJstDate(h.start_date),
      end_date: formatToJstDate(h.end_date),
      plan_name: (h as any).com_m_contract?.plan_name || '不明なプラン'
    }));

    return [...liveLicenses, ...removedLicenses];
  } catch (error) {
    logger.error('contract:get_license_timeline_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { userId } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}