'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { NotificationItem } from '@gabby/types/notification';

const logger = createLogger('common');

/**
 * ログインユーザー宛の通知一覧を取得する（最新発生順）。
 * RLSにより自身(user_id = auth.uid())の行のみが返る。
 */
export async function getNotificationsAction(): Promise<{
  success: boolean;
  data: NotificationItem[];
  error?: string;
}> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, data: [], error: 'Unauthorized' };

    const { data, error } = await supabase
      .from('com_t_notification')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('notification:get_all_failed', error.message, ctx);
      return { success: false, data: [], error: error.message };
    }

    return { success: true, data: (data || []) as NotificationItem[] };
  } catch (err) {
    logger.error('notification:get_all_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, data: [], error: 'Unexpected error' };
  }
}

/**
 * 未読件数を取得（ヘッダーバッジ用）
 */
export async function getUnreadNotificationCountAction(): Promise<number> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const { count, error } = await supabase
      .from('com_t_notification')
      .select('notification_id', { count: 'exact', head: true })
      .eq('is_read', false);

    if (error) {
      logger.error('notification:unread_count_failed', error.message, ctx);
      return 0;
    }

    return count ?? 0;
  } catch (err) {
    logger.error('notification:unread_count_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return 0;
  }
}

/**
 * 指定の通知を既読にする
 */
export async function markNotificationAsReadAction(notificationId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { error } = await supabase
      .from('com_t_notification')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('notification_id', notificationId)
      .eq('user_id', user.id);

    if (error) {
      logger.error('notification:mark_read_failed', error.message, ctx);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    logger.error('notification:mark_read_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * 未読の通知をまとめて既読にする
 */
export async function markAllNotificationsAsReadAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { error } = await supabase
      .from('com_t_notification')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      logger.error('notification:mark_all_read_failed', error.message, ctx);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    logger.error('notification:mark_all_read_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, error: 'Unexpected error' };
  }
}
