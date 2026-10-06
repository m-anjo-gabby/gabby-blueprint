import 'server-only';
import { sendCore } from '../core';
import { renderPasswordResetEmail } from '../render';
import type { PasswordResetMailLanguage } from '../templates/PasswordResetEmailTemplate';
import { createLogger } from '../../logger';

const logger = createLogger('mail');

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
    const data = await sendCore({ to, kind: 'password_reset', ...renderPasswordResetEmail({ resetUrl, language }) });

    logger.info('mail:send_password_reset_success', `パスワードリセットメールを送信しました: ${to}`, { messageId: data?.id, language });
    return { success: true };
  } catch (err) {
    logger.error('mail:send_password_reset_failed', err instanceof Error ? err.message : 'Unknown error', { to });
    return { success: false, error: err instanceof Error ? err.message : 'メール送信中にエラーが発生しました。' };
  }
}
