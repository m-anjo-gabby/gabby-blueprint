'use server';

import { getMyMailSettingsCore, updateMyMailSettingCore, type MailSettings } from '@gabby/lib/mail/settingsActions';

/** Email notification settings (enabled/disabled per category). null if they could not be loaded */
export async function getMyMailSettings(): Promise<MailSettings | null> {
  return getMyMailSettingsCore();
}

/** Update one email notification category */
export async function updateMyMailSetting(category: string, enabled: boolean): Promise<{ success: true } | { success: false; message: string }> {
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
