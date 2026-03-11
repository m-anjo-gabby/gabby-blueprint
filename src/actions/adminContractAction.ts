// src/actions/adminContractAction.ts
'use server';

import { createAdminClient } from "@/lib/admin";
import { revalidatePath } from 'next/cache';

/**
 * ヘルパー：JSTの日付文字列をUTCの開始/終了日時に変換する
 * アドミンが入力した日付（JST）の「開始日の00:00」から「終了日の23:59:59」をUTCとして正確に生成します。
 */
const getUtcRangeFromJstDate = (startDateStr: string, endDateStr: string) => {
  // 日付が空、または不正な場合のガード
  if (!startDateStr || !endDateStr || isNaN(Date.parse(startDateStr)) || isNaN(Date.parse(endDateStr))) {
    throw new Error(`Invalid date provided: start=${startDateStr}, end=${endDateStr}`);
  }
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
 * 契約情報の一覧取得（管理画面一覧用）
 */
export async function getContracts() {
  const supabase = createAdminClient();
  
  // 新しいビューから取得。リレーションの結合なしで1クエリで完結
  const { data: contracts, error } = await supabase
    .from('vw_contract_details')
    .select('*')
    .order('insert_date', { ascending: false });

  if (error) throw new Error(error.message);

  // 日付のフォーマット処理（JST変換）のみ行う
  return contracts.map(contract => ({
    ...contract,
    start_date: contract.start_date ? formatToLocalDate(contract.start_date) : '',
    end_date: contract.end_date ? formatToLocalDate(contract.end_date) : '',
  }));
}

/**
 * 特定顧客の「現在有効かつ枠がある」契約一覧を取得（ユーザー登録フロー用）
 */
export async function getActiveContractsByClient(clientId: string) {
  const supabase = createAdminClient();
  
  const { data: contracts, error } = await supabase
    .from('vw_contract_details')
    .select('*')
    .eq('client_id', clientId)      // 顧客絞り込み
    .eq('status', 1)               // 契約自体が有効
    .lte('start_date', new Date().toISOString()) // 開始済み
    .gte('end_date', new Date().toISOString())   // 未終了
    .gt('remaining_licenses', 0)   // ライセンス残数あり
    .order('plan_name', { ascending: true });

  if (error) {
    console.error("Fetch Active Contracts Error:", error.message);
    return [];
  }

  // 日付を JST の YYYY-MM-DD 形式に変換
  return contracts.map(contract => ({
    ...contract,
    start_date: contract.start_date ? formatToLocalDate(contract.start_date) : '',
    end_date: contract.end_date ? formatToLocalDate(contract.end_date) : '',
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
 * ライセンスの個別追加（UTC変換対応版）
 */
export async function assignLicenseToUser(
  contractId: string,
  userId: string,
  startDateJst: string,
  endDateJst: string
) {
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

  if (error) return { success: false, message: error.message };

  revalidatePath('/admin/contracts');
  revalidatePath('/admin/users');
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
    console.error('Update License Error:', error);
    return { success: false, message: error.message };
  }

  revalidatePath('/admin/contracts');
  revalidatePath('/admin/users');

  return { success: true };
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
    console.error("Bulk License Assignment Error:", error.message);
    return { success: false, message: error.message, errorCount: userIds.length };
  }

  revalidatePath('/admin/users');
  revalidatePath('/admin/contracts');
  
  return { 
    success: true, 
    successCount: data.length,
    assignedUserIds: data.map(d => d.user_id)
  };
}