// apps/admin/actions/adminClientAction.ts
'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { 
  ClientOption, 
  ClientPayload, 
  ClientResponse, 
  ClientRecord 
} from '@gabby/types/client';
import { revalidatePath } from 'next/cache';

/**
 * 顧客一覧取得 フィルター・選択肢用（軽量・全件）
 */
export async function getClientsFilter(): Promise<ClientOption[]> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('com_m_client')
    .select('client_id, client_name')
    .eq('delete_flg', '0') // 論理削除されていないものを対象
    .order('client_name');

  if (error) {
    console.error('Error fetching clients:', error);
    return [];
  }

  return (data || []) as ClientOption[];
}

/**
 * 顧客一覧取得（ページネーション・削除フラグ・検索対応）
 */
export async function getClients(page: number = 1, limit: number = 10, searchQuery?: string) {
  const supabase = await createAdminClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('com_m_client')
    .select('*', { count: 'exact' })
    .eq('delete_flg', '0') // 削除済みは除外
    .order('insert_date', { ascending: false })
    .range(from, to);

  if (searchQuery) {
    query = query.ilike('client_name', `%${searchQuery}%`);
  }

  const { data, count, error } = await query;

  if (error) throw new Error(error.message);

  return {
    clients: data as ClientRecord[],
    totalCount: count || 0,
  };
}

/**
 * 顧客新規作成
 */
export async function createClient(payload: ClientPayload): Promise<ClientResponse> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('com_m_client')
    .insert([payload])
    .select();

  if (error) {
    return { success: false, message: error.message };
  }

  revalidatePath('/clients');
  return { success: true, client: data[0] as ClientRecord };
}

/**
 * 顧客情報の更新
 */
export async function updateClient(
  clientId: string, 
  payload: ClientPayload
): Promise<ClientResponse> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('com_m_client')
    .update({ 
      ...payload,
      update_date: new Date().toISOString() // 更新日時を記録
    })
    .eq('client_id', clientId)
    .select();

  if (error) {
    console.error('Update client error:', error);
    return { success: false, message: error.message };
  }

  revalidatePath('/clients');
  return { success: true, client: data[0] as ClientRecord };
}

/**
 * 顧客の論理削除
 */
export async function deleteClient(clientId: string): Promise<ClientResponse> {
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('com_m_client')
    .update({ 
      delete_flg: '1',
      update_date: new Date().toISOString() 
    })
    .eq('client_id', clientId);

  if (error) {
    console.error('Delete client error:', error);
    return { success: false, message: error.message };
  }

  revalidatePath('/clients');
  return { success: true };
}