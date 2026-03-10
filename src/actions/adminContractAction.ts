// src/actions/adminContractAction.ts
'use server';

import { createAdminClient } from "@/lib/admin";
import { revalidatePath } from 'next/cache';

/**
 * ヘルパー：JSTの日付文字列をUTCの開始/終了日時に変換する
 * アドミンが入力した日付（JST）の「開始日の00:00」から「終了日の23:59:59」をUTCとして正確に生成します。
 */
const getUtcRangeFromJstDate = (startDateStr: string, endDateStr: string) => {
  return {
    startUtc: new Date(`${startDateStr}T00:00:00+09:00`).toISOString(),
    endUtc: new Date(`${endDateStr}T23:59:59.999+09:00`).toISOString(),
  };
};

// ISO形式(UTC)からJSTの YYYY-MM-DD を抽出する
const formatToLocalDate = (dateString?: string) => {
  if (!dateString) return "";
  // 日本時間に変換した上で日付部分(YYYY-MM-DD)だけを切り出す
  const date = new Date(dateString);
  return date.toLocaleDateString('sv-SE'); // 'sv-SE' は YYYY-MM-DD 形式を返します
};

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
    return contracts.map(c => ({ ...c, stats: null }));
  }

  // 取得したデータをマージしつつ、日付をUIフレンドリーな形式（JSTの日付）に変換
  const mergedData = contracts.map(contract => {
    const stat = stats.find(s => s.contract_id === contract.contract_id);
    
    // TIMESTAMPTZ(UTC)をJSTの日付文字列(YYYY-MM-DD)に変換する
    const formattedStartDate = contract.start_date 
      ? formatToLocalDate(contract.start_date)
      : '';
    const formattedEndDate = contract.end_date 
      ? formatToLocalDate(contract.end_date)
      : '';

    return {
      ...contract,
      // UIが期待する日付形式に上書き
      start_date: formattedStartDate,
      end_date: formattedEndDate,
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
  // end_dateをNOW()と比較することで有効なものに絞る（UTC同士の比較）
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
  // ここで受け取るcontractStartDate/EndDateは既にTIMESTAMPTZ(UTC)化されている前提
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