'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { type NotificationItem } from '@gabby/types/notification';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import type { BasicErrorCode, CoreResult } from '@gabby/types/action';

const logger = createLogger('common');

/**
 * ログインユーザー宛の通知一覧を取得する（最新発生順）。
 * RLSにより自身(user_id = auth.uid())の行のみが返る。
 */
export async function getNotifications(): Promise<CoreResult<{ data: NotificationItem[] }, BasicErrorCode>> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_notification')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('notification:get_all_failed', error.message, { ...ctx, err: error });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, data: (data || []) as NotificationItem[] };
  } catch (err) {
    logger.error('notification:get_all_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 未読件数を取得（ヘッダーバッジ用）
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return 0;

    const { count, error } = await supabase
      .from('com_t_notification')
      .select('notification_id', { count: 'exact', head: true })
      .eq('is_read', false);

    if (error) {
      logger.error('notification:unread_count_failed', error.message, { ...ctx, err: error });
      return 0;
    }

    return count ?? 0;
  } catch (err) {
    logger.error('notification:unread_count_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return 0;
  }
}

/**
 * 指定の通知を既読にする
 */
export async function markNotificationAsRead(notificationId: string): Promise<CoreResult<object, BasicErrorCode>> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { error } = await supabase
      .from('com_t_notification')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('notification_id', notificationId)
      .eq('user_id', user.id);

    if (error) {
      logger.error('notification:mark_read_failed', error.message, { ...ctx, err: error });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true };
  } catch (err) {
    logger.error('notification:mark_read_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 未読の通知をまとめて既読にする
 */
export async function markAllNotificationsAsRead(): Promise<CoreResult<object, BasicErrorCode>> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { error } = await supabase
      .from('com_t_notification')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      logger.error('notification:mark_all_read_failed', error.message, { ...ctx, err: error });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true };
  } catch (err) {
    logger.error('notification:mark_all_read_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}
