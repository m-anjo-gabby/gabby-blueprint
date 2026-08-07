// packages/lib/mail/actions/sendCoachInvitation.ts
import * as React from 'react';
import { renderToString } from 'react-dom/server.edge'; // App RouterのRSCで安全に動く軽量エクスポート
import { sendCore } from '../core';
import { CoachInviteEmailTemplate } from '../templates/CoachInviteEmailTemplate';
import { createLogger } from '../../logger'; // プロジェクト共通のロガー

const logger = createLogger('mail');

interface SendCoachInvitationParams {
  to: string;
  userName: string;
  inviteUrl: string;
  expiresDays?: number;
}

/**
 * 🔒 コーチ向け招待メール（英文）を組み立てて Resend 経由で送信する
 */
export async function sendCoachInvitationEmail({
  to,
  userName,
  inviteUrl,
  expiresDays = 3
}: SendCoachInvitationParams): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = { userName, inviteUrl, expiresDays };

    const html = renderToString(React.createElement(CoachInviteEmailTemplate, payload));

    const data = await sendCore({
      to,
      subject: '[Gabby Blueprint] Coach Account Invitation',
      html,
    });

    logger.info('mail:send_coach_invitation_success', `コーチ招待メールを送信しました: ${to}`, { messageId: data?.id });
    return { success: true };

  } catch (err) {
    logger.error('mail:send_coach_invitation_failed', err instanceof Error ? err.message : 'Unknown error', { payload: { to } });
    return { success: false, error: err instanceof Error ? err.message : 'メール送信中に予期せぬエラーが発生しました。' };
  }
}
