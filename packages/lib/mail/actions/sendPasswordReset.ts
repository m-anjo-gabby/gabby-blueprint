import * as React from 'react';
import { renderToString } from 'react-dom/server.edge';
import { sendCore } from '../core';
import { PasswordResetEmailTemplate } from '../templates/PasswordResetEmailTemplate';
import { createLogger } from '../../logger';

const logger = createLogger('mail');

interface SendPasswordResetParams {
  to: string;
  resetUrl: string;
  expiresText?: string;
}

/**
 * 🔒 パスワード再設定メールを組み立てて Resend 経由で送信する
 */
export async function sendPasswordResetEmail({
  to,
  resetUrl,
  expiresText = '30分間'
}: SendPasswordResetParams): Promise<{ success: boolean; error?: string }> {
  try {
    const html = renderToString(
      React.createElement(PasswordResetEmailTemplate, { resetUrl, expiresText })
    );

    const data = await sendCore({
      to,
      subject: '【Gabby Blueprint】パスワード再設定手続きのご案内',
      html,
    });

    logger.info('mail:send_password_reset_success', `パスワードリセットメールを送信しました: ${to}`, { messageId: data?.id });
    return { success: true };
  } catch (err) {
    logger.error('mail:send_password_reset_failed', err instanceof Error ? err.message : 'Unknown error', { to });
    return { success: false, error: err instanceof Error ? err.message : 'メール送信中にエラーが発生しました。' };
  }
}