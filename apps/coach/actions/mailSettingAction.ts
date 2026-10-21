'use server';

import { getMyMailSettingsCore, updateMyMailSettingCore, type MailSettings } from '@gabby/lib/mail/settingsActions';
import type { ActionResult } from '@gabby/types/action';

/** メールの通知の設定（分類ごとの有効・無効）。読み込めなかった場合は null */
export async function getMyMailSettings(): Promise<MailSettings | null> {
  return getMyMailSettingsCore();
}

/** メールの通知の分類を1つ更新する */
export async function updateMyMailSetting(category: string, enabled: boolean): Promise<ActionResult> {
  const result = await updateMyMailSettingCore(category, enabled);
  if (!result.success) {
    return {
      success: false,
      message:
        result.errorCode === 'unauthorized'
          ? 'Your session has expired. Please sign in again.'
          : 'Could not save your email notification settings. Please try again later.',
    };
  }
  return { success: true };
}
