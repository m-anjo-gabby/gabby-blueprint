// packages/lib/mail/actions/sendInvitation.ts
import 'server-only';
import { sendCore } from '../core';
import { renderStudentInvitationEmail } from '../render';
import { createLogger } from '../../logger'; // プロジェクト共通のロガー

const logger = createLogger('mail');

interface SendInvitationParams {
  to: string;
  userName: string;
  inviteUrl: string;
  expiresDays?: number; // 外部（Admin画面など）から可変対応。デフォルトは3
}

/**
 * 🔒 独自招待メールを組み立てて Resend 経由で送信する
 */
export async function sendInvitationEmail({ 
  to, 
  userName, 
  inviteUrl, 
  expiresDays = 3 
}: SendInvitationParams): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await sendCore({ to, kind: 'account_invite_student', ...renderStudentInvitationEmail({ userName, inviteUrl, expiresDays }) });

    logger.info('mail:send_invitation_success', `招待メールを送信しました: ${to}`, { messageId: data?.id });
    return { success: true };

  } catch (err) {
    logger.error('mail:send_invitation_failed', err instanceof Error ? err.message : 'Unknown error', { payload: { to } });
    return { success: false, error: err instanceof Error ? err.message : 'メール送信中に予期せぬエラーが発生しました。' };
  }
}