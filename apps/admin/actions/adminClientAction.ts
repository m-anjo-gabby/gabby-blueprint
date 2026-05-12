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
import { createLogger } from '@gabby/lib/logger/logger';

const logger = createLogger('admin');

/**
 * 顧客一覧取得 フィルター・選択肢用（軽量・全件）
 */
export async function getClientsFilter(): Promise<ClientOption[]> {
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_client')
      .select('client_id, client_name')
      .eq('delete_flg', '0') // 論理削除されていないものを対象
      .order('client_name');

    if (error) {
      logger.error('client:get_filter_failed', error.message);
      return [];
    }

    return (data || []) as ClientOption[];
  } catch (error) {
    logger.error('client:get_filter_unexpected', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

/**
 * 顧客一覧取得（ページネーション・削除フラグ・検索対応）
 */
export async function getClients(page: number = 1, limit: number = 10, searchQuery?: string) {
  try {
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

    if (error) {
      logger.error('client:get_clients_failed', error.message, { payload: { page, limit, searchQuery } });
      throw new Error(error.message);
    }

    return {
      clients: data as ClientRecord[],
      totalCount: count || 0,
    };
  } catch (error) {
    logger.error('client:get_clients_unexpected', error instanceof Error ? error.message : 'Unknown error', { payload: { page, limit, searchQuery } });
    throw error;
  }
}

/**
 * 顧客新規作成
 */
export async function createClient(payload: ClientPayload): Promise<ClientResponse> {
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_client')
      .insert([payload])
      .select();

    if (error) {
      logger.error('client:create_client_failed', error.message, { payload });
      return { success: false, message: error.message };
    }

    const newClient = data[0] as ClientRecord;
    logger.info('client:create_client_success', `Client created: ${newClient.client_name}`, { 
      payload: { clientId: newClient.client_id } 
    });

    revalidatePath('/clients');
    return { success: true, client: newClient };
  } catch (error) {
    logger.error('client:create_client_unexpected', error instanceof Error ? error.message : 'Unknown error', { payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 顧客情報の更新
 */
export async function updateClient(
  clientId: string, 
  payload: ClientPayload
): Promise<ClientResponse> {
  try {
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
      logger.error('client:update_client_failed', error.message, { clientId, payload });
      return { success: false, message: error.message };
    }

    const updatedClient = data[0] as ClientRecord;
    logger.info('client:update_client_success', `Client updated: ${updatedClient.client_name}`, { 
      payload: { clientId: updatedClient.client_id } 
    });

    revalidatePath('/clients');
    return { success: true, client: updatedClient };
  } catch (error) {
    logger.error('client:update_client_unexpected', error instanceof Error ? error.message : 'Unknown error', { clientId, payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 顧客の論理削除
 */
export async function deleteClient(clientId: string): Promise<ClientResponse> {
  try {
    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('com_m_client')
      .update({ 
        delete_flg: '1',
        update_date: new Date().toISOString() 
      })
      .eq('client_id', clientId);

    if (error) {
      logger.error('client:delete_client_failed', error.message, { clientId });
      return { success: false, message: error.message };
    }

    logger.info('client:delete_client_success', `Client logically deleted`, { 
      payload: { clientId } 
    });

    revalidatePath('/clients');
    return { success: true };
  } catch (error) {
    logger.error('client:delete_client_unexpected', error instanceof Error ? error.message : 'Unknown error', { clientId });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}