'use server';

import { getMyMailSettingsCore, updateMyMailSettingCore, type MailSettings } from '@gabby/lib/mail/settingsActions';

/** メール通知の設定（区分ごとの配信・停止）を取得する。取得できない場合は null */
export async function getMyMailSettings(): Promise<MailSettings | null> {
  return getMyMailSettingsCore();
}

/** メール通知の設定（1区分）を更新する */
export async function updateMyMailSetting(category: string, enabled: boolean): Promise<{ success: true } | { success: false; message: string }> {
  const result = await updateMyMailSettingCore(category, enabled);
  if (!result.success) {
    return {
      success: false,
      message:
        result.errorCode === 'unauthorized'
          ? 'セッションが切れています。再度ログインしてください。'
          : 'メール通知の設定を保存できませんでした。時間を置いて再度お試しください。',
    };
  }
  return { success: true };
}
