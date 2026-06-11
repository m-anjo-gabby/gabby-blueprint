// packages/lib/mail/send.ts
import { Resend } from 'resend';
import * as React from 'react';
import { renderToString } from 'react-dom/server.edge';
import { InviteEmailTemplate } from './templates/InviteEmailTemplate';
import { createLogger } from '../logger';

const logger = createLogger('mail');

interface SendInviteMailPayload {
  to: string;
  userName: string;
  inviteUrl: string;
}

/**
 * 🔒 独自招待メールを Resend 経由で送信する
 */
export async function sendInvitationEmail({ to, userName, inviteUrl }: SendInviteMailPayload): Promise<{ success: boolean; error?: string }> {
  try {
    // 💡 安全対策: API Keyが未定義の場合は関数内で即座にガードしてログを残す（クラッシュ防止）
    if (!process.env.RESEND_API_KEY) {
      logger.error('mail:resend_config_missing', 'RESEND_API_KEY is not defined in environment variables.');
      return { success: false, error: 'メール配信システムの設定エラーです。' };
    }

    // 💡 インスタンス化と環境変数取得を関数内で行うことで安全性を担保
    const resend = new Resend(process.env.RESEND_API_KEY);
    const FROM_EMAIL = process.env.MAIL_FROM_AUTH || 'Gabby Academy <noreply@mail.gabbyacademy.com>';

    // ReactコンポーネントをプレーンなHTML文字列に変換
    const emailHtml = renderToString(
      React.createElement(InviteEmailTemplate, { userName, inviteUrl, expiresDays: 1 }) // 24時間期限なら1に変更
    );

    // Resend APIの呼び出し
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL, // 例: "[DEV] Gabby Academy <noreply@mail.gabbyacademy.com>" がそのまま渡ります
      to: [to],
      subject: '【Gabby Blueprint】アカウント招待のお知らせ',
      html: emailHtml,
    });

    if (error) {
      logger.error('mail:resend_api_failed', error.message, { payload: { to } });
      return { success: false, error: error.message };
    }

    logger.info('mail:send_success', `Invitation mail successfully sent to ${to}`, { messageId: data?.id });
    return { success: true };

  } catch (err) {
    logger.error('mail:send_unexpected', err instanceof Error ? err.message : 'Unknown error', { payload: { to } });
    return { success: false, error: 'メール送信中に予期せぬエラーが発生しました。' };
  }
}