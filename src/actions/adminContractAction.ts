// src/actions/adminContractAction.ts
'use server';

import { createAdminClient } from "@/lib/admin";
import { revalidatePath } from 'next/cache';

/**
 * 契約情報の一覧取得
 */
export async function getContracts() {
  const supabase = createAdminClient();
  
  // 契約情報の基本データを取得
  const { data: contracts, error: contractError } = await supabase
    .from('com_m_contract')
    .select(`
      *,
      com_m_client (
        client_name
      )
    `)
    .order('insert_date', { ascending: false });

  if (contractError) throw new Error(contractError.message);

  // 統計ビューから全件取得（リレーションを使わず単体で取得）
  const { data: stats, error: statsError } = await supabase
    .from('vw_contract_license_stats')
    .select('*');

  if (statsError) {
    console.error("Stats View Error:", statsError.message);
    // 統計が取れなくても一覧は見せたいので、空配列で続行
    return contracts.map(c => ({ ...c, stats: null }));
  }

  // contract_id をキーにしてマージ
  const mergedData = contracts.map(contract => {
    const stat = stats.find(s => s.contract_id === contract.contract_id);
    return {
      ...contract,
      // カラム名を直感的にするために stats というキーで入れる
      stats: stat || { current_assigned_count: 0, current_active_count: 0 }
    };
  });

  return mergedData;
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
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('com_m_contract')
    .insert([
      {
        client_id: params.client_id,
        plan_name: params.plan_name,
        max_licenses: params.max_licenses,
        start_date: params.start_date,
        end_date: params.end_date,
        note: params.note || null,
        status: 1, // デフォルト有効
      }
    ])
    .select();

  if (error) {
    console.error('Create contract error:', error);
    return { success: false, message: error.message };
  }

  revalidatePath('/admin/contracts');
  return { success: true, contract: data[0] };
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
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('com_m_contract')
    .update({
      client_id: params.client_id,
      plan_name: params.plan_name,
      max_licenses: params.max_licenses,
      start_date: params.start_date,
      end_date: params.end_date,
      note: params.note || null,
      update_date: new Date().toISOString(),
    })
    .eq('contract_id', contractId)
    .select();

  if (error) {
    console.error('Update contract error:', error);
    return { success: false, message: error.message };
  }

  // 一覧画面のキャッシュを更新して最新の状態を反映させる
  revalidatePath('/admin/contracts');
  
  return { success: true, contract: data[0] };
}

/**
 * ライセンス割当用のユーザーリスト取得
 * 左側：未割当のユーザー（同じ顧客に属しているが、この契約に未割当）
 * 右側：割当済のユーザー（この契約に現在紐付いている）
 */
export async function getLicenseAssignmentUsers(contractId: string, clientId: string) {
  const supabase = createAdminClient();

  // 1. ビューから、その顧客に属する全ユーザーの最新情報を取得
  const { data: allUsers, error: userError } = await supabase
    .from('vw_user_list')
    .select('id, user_name, email, license_id') // license_idがある＝何らかの割当がある
    .eq('client_id', clientId);

  if (userError) {
    console.error("View Fetch Error Details:", userError);
    throw new Error("ユーザーデータの取得に失敗しました");
  }

  // 2. 現在「この特定の契約(contractId)」に紐付いているユーザーを取得
  const { data: currentAssignments, error: assignError } = await supabase
    .from('com_t_user_license')
    .select('user_id')
    .eq('contract_id', contractId)
    .gte('end_date', new Date().toISOString());

  if (assignError) throw new Error("割当情報の取得に失敗しました");

  const assignedUserIds = new Set(currentAssignments.map(a => a.user_id));

  return {
    // 右側：この契約に割当済み
    assignedUsers: allUsers.filter(u => assignedUserIds.has(u.id)),
    // 左側：この契約には未割当（他プランを持っていても、この契約枠には空きがある候補）
    unassignedUsers: allUsers.filter(u => !assignedUserIds.has(u.id)),
  };
}

/**
 * ライセンス割当の一括更新
 * 選択されたユーザーIDリストを受け取り、差分で追加・削除を行う
 */
export async function updateLicenseAssignments(
  contractId: string, 
  userIds: string[], 
  contractStartDate: string, 
  contractEndDate: string
) {
  const supabase = createAdminClient();

  // 1. 現在の割当を全削除（または差分更新）
  // シンプルに一度全削除して再登録する方式（小〜中規模ならこれで十分）
  const { error: deleteError } = await supabase
    .from('com_t_user_license')
    .delete()
    .eq('contract_id', contractId);

  if (deleteError) return { success: false, message: "既存データのクリアに失敗しました" };

  if (userIds.length === 0) {
    revalidatePath('/admin/contracts');
    return { success: true };
  }

  // 2. 新しいリストで一括登録
  const insertData = userIds.map(uid => ({
    contract_id: contractId,
    user_id: uid,
    status: 1,
    start_date: contractStartDate,
    end_date: contractEndDate,
  }));

  const { error: insertError } = await supabase
    .from('com_t_user_license')
    .insert(insertData);

  if (insertError) return { success: false, message: "割当の更新に失敗しました" };

  revalidatePath('/admin/contracts');
  return { success: true };
}

/**
 * ライセンスの個別追加
 */
export async function assignLicenseToUser(
  contractId: string,
  userId: string,
  startDate: string,
  endDate: string
) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('com_t_user_license')
    .insert({
      contract_id: contractId,
      user_id: userId,
      status: 1,
      start_date: startDate,
      end_date: endDate,
    });

  if (error) return { success: false, message: error.message };

  revalidatePath('/admin/contracts');
  return { success: true };
}

/**
 * ライセンスの個別解除（物理削除）
 * ※ ここでは「現在の有効な割当」を消す想定
 */
export async function removeLicenseFromUser(contractId: string, userId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('com_t_user_license')
    .delete()
    .eq('contract_id', contractId)
    .eq('user_id', userId);

  if (error) return { success: false, message: error.message };

  revalidatePath('/admin/contracts');
  return { success: true };
}