// apps/admin/actions/adminContractAction.ts
'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { formatToJstDate, getUtcRangeFromJstDate } from "@gabby/lib/date/date";
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger/logger';

const logger = createLogger('admin');

/**
 * 契約情報の一覧取得（ページネーション・検索対応）
 */
export async function getContracts(page: number = 1, limit: number = 10, searchQuery?: string) {
  try {
    const supabase = await createAdminClient();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('vw_contract_details')
      .select('*', { count: 'exact' });

    // 検索キーワードがあれば、顧客名でフィルタリング
    if (searchQuery) {
      query = query.ilike('client_name', `%${searchQuery}%`);
    }

    const { data: contracts, count, error } = await query
      .order('insert_date', { ascending: false })
      .range(from, to);

    if (error) {
      logger.error('contract:get_contracts_failed', error.message, { payload: { page, limit, searchQuery } });
      throw new Error(error.message);
    }

    // フォーマット処理
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
    logger.error('contract:get_contracts_unexpected', error instanceof Error ? error.message : 'Unknown error', { payload: { page, limit, searchQuery } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * 特定顧客の「現在有効かつ枠がある」契約一覧を取得
 * @param userId 新規登録時は未指定でOK（その場合、除外フィルタをスキップ）
 */
export async function getActiveContractsByClient(clientId: string, userId?: string) {
  try {
    const supabase = createAdminClient();
    
    // 1. 有効かつ空きがある契約を一括取得
    const { data: contracts, error } = await supabase
      .from('vw_contract_details')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 1)
      .gte('end_date', new Date().toISOString())
      .gt('remaining_licenses', 0)
      .order('plan_name', { ascending: true });

    if (error || !contracts) {
      logger.error('contract:get_active_contracts_failed', error?.message || 'No contracts found', { clientId, userId });
      return [];
    }

    // 2. userIdがある場合のみ除外フィルタを適用
    if (userId) {
      const { data: userLicenses } = await supabase
        .from('com_t_user_license')
        .select('contract_id')
        .eq('user_id', userId);

      const existingIds = new Set(userLicenses?.map(l => l.contract_id));
      
      // 3. メモリ上でフィルタリング
      const available = contracts.filter(c => !existingIds.has(c.contract_id));
      
      return formatContracts(available);
    }

    // userIdがない（新規登録）場合は全件そのまま返す
    return formatContracts(contracts);
  } catch (error) {
    logger.error('contract:get_active_contracts_unexpected', error instanceof Error ? error.message : 'Unknown error', { clientId, userId });
    return [];
  }
}

// フォーマット処理を共通関数に切り出すとスッキリします
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
  try {
    const supabase = await createAdminClient();

    // JSTでの入力値をUTCの期間に変換
    const { startUtc, endUtc } = getUtcRangeFromJstDate(params.start_date, params.end_date);

    const { data, error } = await supabase
      .from('com_m_contract')
      .insert([
        {
          client_id: params.client_id,
          plan_name: params.plan_name,
          max_licenses: params.max_licenses,
          start_date: startUtc, // 変換済みのUTC
          end_date: endUtc,     // 変換済みのUTC
          note: params.note || null,
          status: 1, // デフォルト有効
        }
      ])
      .select();

    if (error) {
      logger.error('contract:create_contract_failed', error.message, { params });
      return { success: false, message: error.message };
    }

    const newContract = data[0];
    logger.info('contract:create_contract_success', `Contract created for client: ${params.client_id}`, { 
      payload: { contractId: newContract.contract_id, clientId: params.client_id } 
    });

    revalidatePath('/contracts');
    return { success: true, contract: newContract };
  } catch (error) {
    logger.error('contract:create_contract_unexpected', error instanceof Error ? error.message : 'Unknown error', { params });
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
  try {
    const supabase = await createAdminClient();

    // JSTでの入力値をUTCの期間に変換
    const { startUtc, endUtc } = getUtcRangeFromJstDate(params.start_date, params.end_date);

    const { data, error } = await supabase
      .from('com_m_contract')
      .update({
        client_id: params.client_id,
        plan_name: params.plan_name,
        max_licenses: params.max_licenses,
        start_date: startUtc, // 変換済みのUTC
        end_date: endUtc,     // 変換済みのUTC
        note: params.note || null,
        update_date: new Date().toISOString(),
      })
      .eq('contract_id', contractId)
      .select();

    if (error) {
      logger.error('contract:update_contract_failed', error.message, { contractId, params });
      return { success: false, message: error.message };
    }

    logger.info('contract:update_contract_success', `Contract updated`, { 
      payload: { contractId } 
    });

    // 一覧画面のキャッシュを更新して最新の状態を反映させる
    revalidatePath('/contracts');
    
    return { success: true, contract: data[0] };
  } catch (error) {
    logger.error('contract:update_contract_unexpected', error instanceof Error ? error.message : 'Unknown error', { contractId, params });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * ライセンス割当用のユーザーリスト取得
 * 左側：未割当のユーザー（同じ顧客に属しているが、この契約に未割当）
 * 右側：割当済のユーザー（この契約に現在紐付いている）
 */
export async function getLicenseAssignmentUsers(contractId: string, clientId: string) {
  try {
    const supabase = createAdminClient();

    // 1. ビューから、その顧客に属する全ユーザーの最新情報を取得
    const { data: allUsers, error: userError } = await supabase
      .schema('private') // privateスキーマを指定
      .from('vw_user_list')
      .select('id, user_name, email, license_id') // license_idがある＝何らかの割当がある
      .eq('client_id', clientId)
      .eq('user_type', 1);

    if (userError) {
      logger.error('contract:get_license_assignment_users_view_failed', userError.message, { contractId, clientId });
      throw new Error("ユーザーデータの取得に失敗しました");
    }

    // 2. 現在「この特定の契約(contractId)」に紐付いているユーザーを取得
    const { data: currentAssignments, error: assignError } = await supabase
      .from('com_t_user_license')
      .select('user_id')
      .eq('contract_id', contractId);

    if (assignError) {
      logger.error('contract:get_license_assignment_users_assignments_failed', assignError.message, { contractId, clientId });
      throw new Error("割当情報の取得に失敗しました");
    }

    const assignedUserIds = new Set((currentAssignments || []).map(a => a.user_id));

    return {
      // 右側：この契約に割当済み
      assignedUsers: (allUsers || []).filter(u => assignedUserIds.has(u.id)),
      // 左側：この契約には未割当（他プランを持っていても、この契約枠には空きがある候補）
      unassignedUsers: (allUsers || []).filter(u => !assignedUserIds.has(u.id)),
    };
  } catch (error) {
    logger.error('contract:get_license_assignment_users_unexpected', error instanceof Error ? error.message : 'Unknown error', { contractId, clientId });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * ライセンスの個別追加（UTC変換対応版）
 */
export async function assignLicenseToUser(
  contractId: string,
  userId: string,
  startDateJst: string,
  endDateJst: string
) {
  try {
    const supabase = createAdminClient();

    // UTC変換
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
      logger.error('contract:assign_license_failed', error.message, { contractId, userId, startDateJst, endDateJst });
      return { success: false, message: error.message };
    }

    logger.info('contract:assign_license_success', `License assigned to user`, { 
      payload: { contractId, userId } 
    });

    revalidatePath('/contracts');
    revalidatePath('/users');
    return { success: true };
  } catch (error) {
    logger.error('contract:assign_license_unexpected', error instanceof Error ? error.message : 'Unknown error', { contractId, userId, startDateJst, endDateJst });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * ライセンスの個別解除（物理削除）
 * ※ ここでは「現在の有効な割当」を消す想定
 */
export async function removeLicenseFromUser(contractId: string, userId: string) {
  try {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('com_t_user_license')
      .delete()
      .eq('contract_id', contractId)
      .eq('user_id', userId);

    if (error) {
      logger.error('contract:remove_license_failed', error.message, { contractId, userId });
      return { success: false, message: error.message };
    }

    logger.info('contract:remove_license_success', `License removed from user`, { 
      payload: { contractId, userId } 
    });

    revalidatePath('/contracts');
    return { success: true };
  } catch (error) {
    logger.error('contract:remove_license_unexpected', error instanceof Error ? error.message : 'Unknown error', { contractId, userId });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * ライセンス情報の個別更新（UTC変換対応版）
 */
export async function updateUserLicense(
  licenseId: string,
  updates: {
    start_date?: string; // YYYY-MM-DD (JST)
    end_date?: string;   // YYYY-MM-DD (JST)
    status?: number;
    note?: string | null;
  }
) {
  try {
    const supabase = createAdminClient();

    // 更新用データのコピー
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = { ...updates };

    // 日付が指定されている場合、JST -> UTC 変換を行う
    // 個別更新画面でも 00:00:00 〜 23:59:59 の範囲を維持するために getUtcRangeFromJstDate を流用
    if (updates.start_date || updates.end_date) {
      // どちらか片方しかない場合を考慮し、デフォルト値として空文字を避ける
      // (getUtcRangeFromJstDate が両方の引数を必要とするため)
      const tempStart = updates.start_date || "2000-01-01"; // ダミー
      const tempEnd = updates.end_date || "2099-12-31";     // ダミー
      
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
      logger.error('contract:update_user_license_failed', error.message, { licenseId, updates });
      return { success: false, message: error.message };
    }

    logger.info('contract:update_user_license_success', `User license updated`, { 
      payload: { licenseId } 
    });

    revalidatePath('/contracts');
    revalidatePath('/users');

    return { success: true };
  } catch (error) {
    logger.error('contract:update_user_license_unexpected', error instanceof Error ? error.message : 'Unknown error', { licenseId, updates });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * ライセンスの一括割当（UTC変換対応版）
 */
export async function bulkAssignLicenses(
  contractId: string,
  userIds: string[],
  startDateJst: string, // YYYY-MM-DD
  endDateJst: string    // YYYY-MM-DD
) {
  try {
    const supabase = createAdminClient();

    // 1. JSTでの入力値をUTCの期間に変換（契約作成時と同じロジック）
    const { startUtc, endUtc } = getUtcRangeFromJstDate(startDateJst, endDateJst);

    // 2. インサート用データの作成
    const insertData = userIds.map(userId => ({
      contract_id: contractId,
      user_id: userId,
      status: 1,
      start_date: startUtc, // UTCに統一
      end_date: endUtc,     // UTCに統一
    }));

    // 3. まとめてインサート
    const { data, error } = await supabase
      .from('com_t_user_license')
      .insert(insertData)
      .select();

    if (error) {
      logger.error('contract:bulk_assign_licenses_failed', error.message, { contractId, userIds, startDateJst, endDateJst });
      return { success: false, message: error.message, errorCount: userIds.length };
    }

    logger.info('contract:bulk_assign_licenses_success', `Bulk licenses assigned`, { 
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
    logger.error('contract:bulk_assign_licenses_unexpected', error instanceof Error ? error.message : 'Unknown error', { contractId, userIds, startDateJst, endDateJst });
    return { success: false, message: '予期せぬエラーが発生しました', errorCount: userIds.length };
  }
}

/**
 * ユーザーのライセンス履歴・現在・未来すべてを取得
 */
export async function getLicenseTimeline(userId: string) {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_t_user_license')
      .select(`
        *,
        com_m_contract (plan_name)
      `)
      .eq('user_id', userId)
      .order('start_date', { ascending: false }); // 新しい順

    if (error) {
      logger.error('contract:get_license_timeline_failed', error.message, { userId });
      throw error;
    }

    return (data || []).map(l => ({
      ...l,
      start_date: formatToJstDate(l.start_date),
      end_date: formatToJstDate(l.end_date),
      plan_name: (l as any).com_m_contract?.plan_name || '不明なプラン'
    }));
  } catch (error) {
    logger.error('contract:get_license_timeline_unexpected', error instanceof Error ? error.message : 'Unknown error', { userId });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}