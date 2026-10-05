'use server';

import { createServerClient } from '../supabase/server';
import { getAuthUser } from '../supabase/authUser';
import { createLogger } from '../logger';
import { getLogContext } from '../logger/context';
import { ACTIVE_MAIL_CATEGORIES, isMailCategory, type MailCategory } from './dispatch/registry';

const logger = createLogger('common');

/** 区分ごとの配信設定（設定画面に出す区分＝メールが1種類以上ある区分だけ） */
export type MailSettings = Partial<Record<MailCategory, boolean>>;

/**
 * ログイン中のユーザーのメール配信設定を取得する（生徒・コーチ共通。ポータル共通）。
 * 行が無い区分は配信する（初期値オン）。
 */
export async function getMyMailSettingsCore(): Promise<MailSettings | null> {
  const ctx = await getLogContext();
  try {
    const user = await getAuthUser();
    if (!user) return null;
    const supabase = await createServerClient();
    const { data, error } = await supabase.from('com_t_user_mail_setting').select('category, enabled').eq('user_id', user.id);
    if (error) {
      logger.error('mail:get_settings_failed', error.message, { ...ctx, userId: user.id });
      return null;
    }
    const settings: MailSettings = {};
    for (const category of ACTIVE_MAIL_CATEGORIES) {
      settings[category] = data?.find((row) => row.category === category)?.enabled ?? true;
    }
    return settings;
  } catch (err) {
    logger.error('mail:get_settings_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return null;
  }
}

/** ログイン中のユーザーのメール配信設定（1区分）を更新する */
export async function updateMyMailSettingCore(
  category: string,
  enabled: boolean
): Promise<{ success: true } | { success: false; errorCode: 'unauthorized' | 'invalid_category' | 'unexpected_error' }> {
  const ctx = await getLogContext();
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };
    if (!isMailCategory(category)) return { success: false, errorCode: 'invalid_category' };

    const supabase = await createServerClient();
    const { error } = await supabase
      .from('com_t_user_mail_setting')
      .upsert(
        { user_id: user.id, category, enabled, update_date: new Date().toISOString() },
        { onConflict: 'user_id,category' }
      );
    if (error) {
      logger.error('mail:update_setting_failed', error.message, { ...ctx, userId: user.id, payload: { category, enabled } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    logger.info('mail:update_setting_success', 'Updated mail setting', { ...ctx, userId: user.id, payload: { category, enabled } });
    return { success: true };
  } catch (err) {
    logger.error('mail:update_setting_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
