'use server';

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { isInUseError } from '@gabby/lib/supabase/pgErrors';
import type { ActionResult } from '@gabby/types/action';
import type { TableInsert } from '@gabby/types/db';
import { type TimezoneMaster } from '@gabby/types/timezone';
import { requireAdminRole, SYSTEM_ADMIN_ONLY } from '@/lib/adminAuth';

const logger = createLogger('admin');

/**
 * タイムゾーン一覧取得
 */
export async function getTimezones(): Promise<TimezoneMaster[]> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('com_m_timezone').select('*').order('sort_no', { ascending: true });

    if (error) {
      logger.error('timezone:get_timezones_failed', error.message, { ...ctx, err: error });
      throw new Error(error.message);
    }
    return data as TimezoneMaster[];
  } catch (error) {
    unstable_rethrow(error);
    logger.error('timezone:get_timezones_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
    });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * タイムゾーンの保存（新規・更新）
 * timezone（IANAタイムゾーン名）を主キーとしてupsertする。
 * IANA形式として不正な値はDB側のトリガー（validate_iana_timezone）で拒否される。
 */
export async function upsertTimezone(
  payload: TableInsert<'com_m_timezone'>,
): Promise<ActionResult<{ data: TimezoneMaster }>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
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
        { onConflict: 'timezone' },
      )
      .select()
      .single();

    if (error) {
      logger.error('timezone:upsert_timezone_failed', error.message, { ...ctx, err: error, payload });
      return { success: false, message: t('common.errors.unexpected') };
    }

    const savedTimezone = data as TimezoneMaster;
    logger.info('timezone:upsert_timezone_success', `Timezone upserted: ${savedTimezone.timezone}`, {
      ...ctx,
      payload: { timezone: savedTimezone.timezone },
    });

    revalidatePath('/timezones');
    return { success: true, data: savedTimezone };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('timezone:upsert_timezone_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload,
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * タイムゾーンの削除（誤登録の取り消し）。ユーザー等が使っているタイムゾーンは外部キー（RESTRICT）で止まり、
 * 使用停止（is_active = false）にするよう案内する
 */
export async function deleteTimezone(timezone: string): Promise<ActionResult<object, 'in_use'>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('com_m_timezone').delete().eq('timezone', timezone);

    if (error) {
      if (isInUseError(error))
        return { success: false, errorCode: 'in_use' as const, message: t('common.errors.unexpected') };
      logger.error('timezone:delete_timezone_failed', error.message, { ...ctx, err: error, payload: { timezone } });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('timezone:delete_timezone_success', 'Timezone deleted', { ...ctx, payload: { timezone } });

    revalidatePath('/timezones');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('timezone:delete_timezone_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { timezone },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}
