'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { TimezoneMaster } from '@gabby/types/timezone';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';

const logger = createLogger('admin');

/**
 * タイムゾーン一覧取得
 */
export async function getTimezones() {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_timezone')
      .select('*')
      .eq('delete_flg', '0')
      .order('sort_no', { ascending: true });

    if (error) {
      logger.error('timezone:get_timezones_failed', error.message, ctx);
      throw new Error(error.message);
    }
    return data as TimezoneMaster[];
  } catch (error) {
    logger.error('timezone:get_timezones_unexpected', error instanceof Error ? error.message : 'Unknown error', ctx);
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * タイムゾーンの保存（新規・更新）
 * timezone（IANAタイムゾーン名）を主キーとしてupsertする。
 * IANA形式として不正な値はDB側のトリガー（validate_iana_timezone）で拒否される。
 */
export async function upsertTimezone(payload: Partial<TimezoneMaster>) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('com_m_timezone')
      .upsert(
        {
          ...payload,
          update_date: new Date().toISOString(),
        },
        { onConflict: 'timezone' }
      )
      .select()
      .single();

    if (error) {
      logger.error('timezone:upsert_timezone_failed', error.message, { ...ctx, payload });
      return { success: false, message: error.message };
    }

    const savedTimezone = data as TimezoneMaster;
    logger.info('timezone:upsert_timezone_success', `Timezone upserted: ${savedTimezone.timezone}`, {
      ...ctx,
      payload: { timezone: savedTimezone.timezone },
    });

    revalidatePath('/timezones');
    return { success: true, data: savedTimezone };
  } catch (error) {
    logger.error('timezone:upsert_timezone_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * タイムゾーンの論理削除
 */
export async function deleteTimezone(timezone: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('com_m_timezone')
      .update({ delete_flg: '1', update_date: new Date().toISOString() })
      .eq('timezone', timezone);

    if (error) {
      logger.error('timezone:delete_timezone_failed', error.message, { ...ctx, payload: { timezone } });
      return { success: false, message: error.message };
    }

    logger.info('timezone:delete_timezone_success', 'Timezone logically deleted', { ...ctx, payload: { timezone } });

    revalidatePath('/timezones');
    return { success: true };
  } catch (error) {
    logger.error('timezone:delete_timezone_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { timezone } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}
