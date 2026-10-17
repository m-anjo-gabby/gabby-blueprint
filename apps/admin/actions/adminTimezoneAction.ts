'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { TimezoneMaster } from '@gabby/types/timezone';
import type { TableInsert } from '@gabby/types/db';
import { revalidatePath } from 'next/cache';
import { isInUseError } from '@gabby/lib/supabase/pgErrors';
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
      .order('sort_no', { ascending: true });

    if (error) {
      logger.error('timezone:get_timezones_failed', error.message, { ...ctx, err: error });
      throw new Error(error.message);
    }
    return data as TimezoneMaster[];
  } catch (error) {
    logger.error('timezone:get_timezones_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, err: error });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * タイムゾーンの保存（新規・更新）
 * timezone（IANAタイムゾーン名）を主キーとしてupsertする。
 * IANA形式として不正な値はDB側のトリガー（validate_iana_timezone）で拒否される。
 */
export async function upsertTimezone(payload: TableInsert<'com_m_timezone'>) {
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
      logger.error('timezone:upsert_timezone_failed', error.message, { ...ctx, err: error, payload });
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
    logger.error('timezone:upsert_timezone_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, err: error, payload });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * タイムゾーンの削除（誤登録の取り消し）。ユーザー等が使っているタイムゾーンは外部キー（RESTRICT）で止まり、
 * 使用停止（is_active = false）にするよう案内する
 */
export async function deleteTimezone(timezone: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('com_m_timezone')
      .delete()
      .eq('timezone', timezone);

    if (error) {
      if (isInUseError(error)) return { success: false, reason: 'in_use' as const, message: error.message };
      logger.error('timezone:delete_timezone_failed', error.message, { ...ctx, err: error, payload: { timezone } });
      return { success: false, message: error.message };
    }

    logger.info('timezone:delete_timezone_success', 'Timezone deleted', { ...ctx, payload: { timezone } });

    revalidatePath('/timezones');
    return { success: true };
  } catch (error) {
    logger.error('timezone:delete_timezone_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, err: error, payload: { timezone } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}
