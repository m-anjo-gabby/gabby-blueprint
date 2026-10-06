// packages/lib/mail/actions/sendCoachInvitation.ts
import 'server-only';
import { sendCore } from '../core';
import { renderCoachInvitationEmail } from '../render';
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
    const data = await sendCore({ to, kind: 'account_invite_coach', ...renderCoachInvitationEmail({ userName, inviteUrl, expiresDays }) });

    logger.info('mail:send_coach_invitation_success', `コーチ招待メールを送信しました: ${to}`, { messageId: data?.id });
    return { success: true };

  } catch (err) {
    logger.error('mail:send_coach_invitation_failed', err instanceof Error ? err.message : 'Unknown error', { payload: { to } });
    return { success: false, error: err instanceof Error ? err.message : 'メール送信中に予期せぬエラーが発生しました。' };
  }
}
