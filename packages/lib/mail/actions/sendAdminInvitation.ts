// packages/lib/mail/actions/sendAdminInvitation.ts
import 'server-only';
import { sendCore } from '../core';
import { renderAdminInvitationEmail } from '../render';
import { createLogger } from '../../logger'; // プロジェクト共通のロガー

const logger = createLogger('mail');

interface SendAdminInvitationParams {
  to: string;
  /** 招待時の氏名。空ならテンプレート側の既定の宛名（管理者様 / Dear Administrator） */
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
    const data = await sendCore({ to, kind: 'account_invite_admin', ...renderAdminInvitationEmail({ userName, inviteUrl, expiresDays }) });

    logger.info('mail:send_admin_invitation_success', `管理者招待メールを送信しました: ${to}`, { messageId: data?.id });
    return { success: true };

  } catch (err) {
    logger.error('mail:send_admin_invitation_failed', err instanceof Error ? err.message : 'Unknown error', { payload: { to } });
    return { success: false, error: err instanceof Error ? err.message : 'メール送信中に予期せぬエラーが発生しました。' };
  }
}
