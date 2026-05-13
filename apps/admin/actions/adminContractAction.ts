// apps/admin/actions/adminContractAction.ts
'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { formatToJstDate, getUtcRangeFromJstDate } from "@gabby/lib/date/date";
import { revalidatePath } from 'next/cache';
import { createLogger, getLogContext } from '@gabby/lib/logger';

const logger = createLogger('admin');

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
        .select('contract_id')
        .eq('user_id', userId);

      const existingIds = new Set(userLicenses?.map(l => l.contract_id));
      const available = contracts.filter(c => !existingIds.has(c.contract_id));
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
}) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { startUtc, endUtc } = getUtcRangeFromJstDate(params.start_date, params.end_date);

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
    note?: string | null;
  }
) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { startUtc, endUtc } = getUtcRangeFromJstDate(params.start_date, params.end_date);

    const { data, error } = await supabase
      .from('com_m_contract')
      .update({
        client_id: params.client_id,
        plan_name: params.plan_name,
        max_licenses: params.max_licenses,
        start_date: startUtc,
        end_date: endUtc,
        note: params.note || null,
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

    return {
      assignedUsers: (allUsers || []).filter(u => assignedUserIds.has(u.id)),
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

    const { error } = await supabase
      .from('com_t_user_license')
      .insert({
        contract_id: contractId,
        user_id: userId,
        status: 1,
        start_date: startUtc,
        end_date: endUtc,
      });

    if (error) {
      logger.error('contract:assign_license_failed', error.message, { ...ctx, payload: { contractId, userId, startDateJst, endDateJst } });
      return { success: false, message: error.message };
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

    const { error } = await supabase
      .from('com_t_user_license')
      .delete()
      .eq('contract_id', contractId)
      .eq('user_id', userId);

    if (error) {
      logger.error('contract:remove_license_failed', error.message, { ...ctx, payload: { contractId, userId } });
      return { success: false, message: error.message };
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
    const payload: any = { ...updates };

    if (updates.start_date || updates.end_date) {
      const tempStart = updates.start_date || "2000-01-01";
      const tempEnd = updates.end_date || "2099-12-31";
      const { startUtc, endUtc } = getUtcRangeFromJstDate(tempStart, tempEnd);
      if (updates.start_date) payload.start_date = startUtc;
      if (updates.end_date) payload.end_date = endUtc;
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

    const insertData = userIds.map(userId => ({
      contract_id: contractId,
      user_id: userId,
      status: 1,
      start_date: startUtc,
      end_date: endUtc,
    }));

    const { data, error } = await supabase
      .from('com_t_user_license')
      .insert(insertData)
      .select();

    if (error) {
      logger.error('contract:bulk_assign_licenses_failed', error.message, { ...ctx, payload: { contractId, userIds, startDateJst, endDateJst } });
      return { success: false, message: error.message, errorCount: userIds.length };
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
      assignedUserIds: (data || []).map(d => d.user_id)
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

    return (data || []).map(l => ({
      ...l,
      start_date: formatToJstDate(l.start_date),
      end_date: formatToJstDate(l.end_date),
      plan_name: (l as any).com_m_contract?.plan_name || '不明なプラン'
    }));
  } catch (error) {
    logger.error('contract:get_license_timeline_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { userId } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}