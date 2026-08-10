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
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';

const logger = createLogger('admin');

/**
 * 顧客一覧取得 フィルター・選択肢用（軽量・全件）
 */
export async function getClientsFilter(): Promise<ClientOption[]> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    // createAdminClient内で既にServiceRoleが使われるためgetSessionは不要ですが、
    // 監査ログ等でセッション情報が必要な場合はここでctxが活用されます。

    const { data, error } = await supabase
      .from('com_m_client')
      .select('client_id, client_name')
      .eq('delete_flg', '0')
      .order('client_name');

    if (error) {
      logger.error('client:get_filter_failed', error.message, ctx);
      return [];
    }

    return (data || []) as ClientOption[];
  } catch (error) {
    logger.error('client:get_filter_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    return [];
  }
}

/**
 * 顧客一覧取得（ページネーション・削除フラグ・検索対応）
 */
export async function getClients(page: number = 1, limit: number = 10, searchQuery?: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('com_m_client')
      .select('*', { count: 'exact' })
      .eq('delete_flg', '0')
      .order('insert_date', { ascending: false })
      .range(from, to);

    if (searchQuery) {
      query = query.ilike('client_name', `%${searchQuery}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      logger.error('client:get_clients_failed', error.message, { ...ctx, payload: { page, limit, searchQuery } });
      throw new Error(error.message);
    }

    return {
      clients: data as ClientRecord[],
      totalCount: count || 0,
    };
  } catch (error) {
    logger.error('client:get_clients_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { page, limit, searchQuery } });
    throw error;
  }
}

/**
 * 顧客新規作成
 */
export async function createClient(payload: ClientPayload): Promise<ClientResponse> {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_client')
      .insert([payload])
      .select();

    if (error) {
      logger.error('client:create_client_failed', error.message, { ...ctx, payload });
      return { success: false, message: error.message };
    }

    const newClient = data[0] as ClientRecord;
    logger.info('client:create_client_success', `Client created: ${newClient.client_name}`, { 
      ...ctx,
      payload: { clientId: newClient.client_id } 
    });

    revalidatePath('/clients');
    return { success: true, client: newClient };
  } catch (error) {
    logger.error('client:create_client_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload });
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
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_client')
      .update({ 
        ...payload,
        update_date: new Date().toISOString()
      })
      .eq('client_id', clientId)
      .select();

    if (error) {
      logger.error('client:update_client_failed', error.message, { ...ctx, payload: { clientId, ...payload } });
      return { success: false, message: error.message };
    }

    const updatedClient = data[0] as ClientRecord;
    logger.info('client:update_client_success', `Client updated: ${updatedClient.client_name}`, { 
      ...ctx,
      payload: { clientId: updatedClient.client_id } 
    });

    revalidatePath('/clients');
    return { success: true, client: updatedClient };
  } catch (error) {
    logger.error('client:update_client_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { clientId, ...payload } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 顧客の論理削除
 */
export async function deleteClient(clientId: string): Promise<ClientResponse> {
  const ctx = await getLogContext();
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
      logger.error('client:delete_client_failed', error.message, { ...ctx, payload: { clientId } });
      return { success: false, message: error.message };
    }

    logger.info('client:delete_client_success', `Client logically deleted`, { 
      ...ctx,
      payload: { clientId } 
    });

    revalidatePath('/clients');
    return { success: true };
  } catch (error) {
    logger.error('client:delete_client_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { clientId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}