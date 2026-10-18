// apps/admin/actions/adminClientAction.ts
'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { type ClientOption, type ClientPayload, type ClientResponse, type ClientRecord } from '@gabby/types/client';
import { revalidatePath } from 'next/cache';
import { isInUseError } from '@gabby/lib/supabase/pgErrors';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { containsPattern } from '@gabby/lib/supabase/ilike';
import { toRange, type ListParams, type ListResult } from '@/lib/list';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { getTranslations } from 'next-intl/server';

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
      .select('client_id, client_name, status')
      .order('status', { ascending: true })
      .order('client_name');

    if (error) {
      logger.error('client:get_filter_failed', error.message, { ...ctx, err: error });
      return [];
    }

    return (data || []) as ClientOption[];
  } catch (error) {
    logger.error('client:get_filter_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
    });
    return [];
  }
}

/**
 * 顧客一覧取得（ページネーション・顧客名の部分一致検索。取引終了の顧客も含む）
 */
export async function getClients(params: ListParams): Promise<ListResult<ClientRecord>> {
  const ctx = await getLogContext();
  const { q } = params;
  try {
    const supabase = createAdminClient();
    const [from, to] = toRange(params);

    let query = supabase
      .from('com_m_client')
      .select('*', { count: 'exact' })
      .order('status', { ascending: true })
      .order('insert_date', { ascending: false })
      .order('client_id', { ascending: true }) // 同順位の並びを一意に固定し、range(LIMIT/OFFSET)でのページ間の重複・欠落を防ぐ
      .range(from, to);

    if (q) {
      query = query.ilike('client_name', containsPattern(q));
    }

    const { data, count, error } = await query;

    if (error) {
      logger.error('client:get_clients_failed', error.message, { ...ctx, err: error, payload: { from, to } });
      throw new Error(error.message);
    }

    return {
      rows: data as ClientRecord[],
      totalCount: count || 0,
    };
  } catch (error) {
    logger.error('client:get_clients_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
    });
    throw error;
  }
}

/**
 * 顧客新規作成
 */
export async function createClient(payload: ClientPayload): Promise<ClientResponse> {
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase.from('com_m_client').insert([payload]).select();

    if (error) {
      logger.error('client:create_client_failed', error.message, { ...ctx, err: error, payload });
      return { success: false, message: t('common.errors.unexpected') };
    }

    const newClient = data[0] as ClientRecord;
    logger.info('client:create_client_success', `Client created: ${newClient.client_name}`, {
      ...ctx,
      payload: { clientId: newClient.client_id },
    });

    revalidatePath('/clients');
    return { success: true, client: newClient };
  } catch (error) {
    logger.error('client:create_client_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload,
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 顧客情報の更新
 */
export async function updateClient(clientId: string, payload: ClientPayload): Promise<ClientResponse> {
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_client')
      .update({
        ...payload,
        update_date: new Date().toISOString(),
      })
      .eq('client_id', clientId)
      .select();

    if (error) {
      logger.error('client:update_client_failed', error.message, {
        ...ctx,
        err: error,
        payload: { clientId, ...payload },
      });
      return { success: false, message: t('common.errors.unexpected') };
    }

    const updatedClient = data[0] as ClientRecord;
    logger.info('client:update_client_success', `Client updated: ${updatedClient.client_name}`, {
      ...ctx,
      payload: { clientId: updatedClient.client_id },
    });

    revalidatePath('/clients');
    return { success: true, client: updatedClient };
  } catch (error) {
    logger.error('client:update_client_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { clientId, ...payload },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 顧客の削除（誤登録の取り消し）。契約・ユーザーがある顧客は外部キー（RESTRICT）で止まり、
 * 取引の終了（status）か、DangerZone の一括削除（purgeClient）を案内する
 */
export async function deleteClient(clientId: string): Promise<ClientResponse> {
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { error } = await supabase.from('com_m_client').delete().eq('client_id', clientId);

    if (error) {
      if (isInUseError(error)) return { success: false, errorCode: 'in_use', message: t('common.errors.unexpected') };
      logger.error('client:delete_client_failed', error.message, { ...ctx, err: error, payload: { clientId } });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('client:delete_client_success', `Client deleted`, {
      ...ctx,
      payload: { clientId },
    });

    revalidatePath('/clients');
    return { success: true };
  } catch (error) {
    logger.error('client:delete_client_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { clientId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}
