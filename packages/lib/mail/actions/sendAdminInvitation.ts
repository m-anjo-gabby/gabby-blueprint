// packages/lib/mail/actions/sendAdminInvitation.ts
import * as React from 'react';
import { renderToString } from 'react-dom/server.edge'; // App RouterのRSCで安全に動く軽量エクスポート
import { sendCore } from '../core';
import { AdminInviteEmailTemplate } from '../templates/AdminInviteEmailTemplate';
import { createLogger } from '../../logger'; // プロジェクト共通のロガー

const logger = createLogger('mail');

interface SendAdminInvitationParams {
  to: string;
  userName: string;
  inviteUrl: string;
  expiresDays?: number;
}

/**
 * 🔒 管理者向け招待メールを組み立てて Resend 経由で送信する
 */
export async function sendAdminInvitationEmail({
  to,
  userName,
  inviteUrl,
  expiresDays = 3
}: SendAdminInvitationParams): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = { userName, inviteUrl, expiresDays };

    const html = renderToString(React.createElement(AdminInviteEmailTemplate, payload));

    const data = await sendCore({
      to,
      subject: '【Gabby Blueprint】管理者アカウント招待のご案内',
      html,
    });

    logger.info('mail:send_admin_invitation_success', `管理者招待メールを送信しました: ${to}`, { messageId: data?.id });
    return { success: true };

  } catch (err) {
    logger.error('mail:send_admin_invitation_failed', err instanceof Error ? err.message : 'Unknown error', { payload: { to } });
    return { success: false, error: err instanceof Error ? err.message : 'メール送信中に予期せぬエラーが発生しました。' };
  }
}
