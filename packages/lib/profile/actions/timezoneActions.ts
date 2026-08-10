'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger, getLogContext } from '../../logger';
import { GetTimezoneListResult, UpdateTimezoneResult } from '@gabby/types/profile';

const logger = createLogger('common');

/**
 * タイムゾーンマスタの選択肢一覧を取得する（ポータル共通、認証済みユーザーであれば取得可能）
 */
export async function getTimezoneListCore(): Promise<GetTimezoneListResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('com_m_timezone')
      .select('*')
      .eq('delete_flg', '0')
      .order('sort_no', { ascending: true });

    if (error) {
      logger.error('profile:get_timezone_list_failed', error.message, ctx);
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, timezones: data ?? [] };
  } catch (err) {
    logger.error('profile:get_timezone_list_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中ユーザー自身のタイムゾーンを更新する（ポータル共通）
 * com_m_timezoneマスタに存在する値であることを確認したうえで、
 * 認証済み本人の com_m_user.timezone のみを更新する（RLS: id = auth.uid()）。
 */
export async function updateMyTimezoneCore(timezone: string): Promise<UpdateTimezoneResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: master, error: masterError } = await supabase
      .from('com_m_timezone')
      .select('timezone')
      .eq('timezone', timezone)
      .eq('delete_flg', '0')
      .maybeSingle();

    if (masterError || !master) {
      return { success: false, errorCode: 'invalid_timezone' };
    }

    const { error: updateError } = await supabase
      .from('com_m_user')
      .update({ timezone, update_date: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      logger.error('profile:update_timezone_failed', updateError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'db_update_failed' };
    }

    logger.info('profile:update_timezone_success', `Timezone updated: ${timezone}`, { ...ctx, userId: user.id });
    return { success: true, timezone };
  } catch (err) {
    logger.error('profile:update_timezone_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
