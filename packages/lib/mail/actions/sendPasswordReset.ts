import * as React from 'react';
import { renderToString } from 'react-dom/server.edge';
import { sendCore } from '../core';
import {
  PASSWORD_RESET_SUBJECTS,
  PasswordResetEmailTemplate,
  type PasswordResetMailLanguage,
} from '../templates/PasswordResetEmailTemplate';
import { createLogger } from '../../logger';

const logger = createLogger('mail');

/**
 * 再設定リンクの有効期限（分）。Supabase の Auth 設定「Email OTP Expiration」（supabase/config.toml の otp_expiry）と
 * 合わせること（dev・本番とも 1800秒＝30分）。メール本文の期限表記に使う。
 */
export const PASSWORD_RESET_LINK_TTL_MINUTES = 30;

interface SendPasswordResetParams {
  to: string;
  resetUrl: string;
  /** メールの言語（student: ja / coach: en / admin: bilingual） */
  language: PasswordResetMailLanguage;
}

/**
 * 🔒 パスワード再設定メールを組み立てて Resend 経由で送信する
 */
export async function sendPasswordResetEmail({
  to,
  resetUrl,
  language,
}: SendPasswordResetParams): Promise<{ success: boolean; error?: string }> {
  try {
    const html = renderToString(
      React.createElement(PasswordResetEmailTemplate, {
        resetUrl,
        language,
        expiresInMinutes: PASSWORD_RESET_LINK_TTL_MINUTES,
      })
    );

    const data = await sendCore({
      to,
      subject: PASSWORD_RESET_SUBJECTS[language],
      html,
    });

    logger.info('mail:send_password_reset_success', `パスワードリセットメールを送信しました: ${to}`, { messageId: data?.id, language });
    return { success: true };
  } catch (err) {
    logger.error('mail:send_password_reset_failed', err instanceof Error ? err.message : 'Unknown error', { to });
    return { success: false, error: err instanceof Error ? err.message : 'メール送信中にエラーが発生しました。' };
  }
}
