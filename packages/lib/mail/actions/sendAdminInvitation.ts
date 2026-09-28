// packages/lib/mail/actions/sendAdminInvitation.ts
import * as React from 'react';
import { renderToString } from 'react-dom/server.edge'; // App RouterのRSCで安全に動く軽量エクスポート
import { sendCore } from '../core';
import { ADMIN_INVITATION_SUBJECT, AdminInviteEmailTemplate } from '../templates/AdminInviteEmailTemplate';
import { createLogger } from '../../logger'; // プロジェクト共通のロガー

const logger = createLogger('mail');

interface SendAdminInvitationParams {
  to: string;
  /** 招待時の氏名。空ならテンプレート側の既定の宛名（管理者様 / Dear Administrator） */
  userName: string;
  inviteUrl: string;
  expiresDays?: number;
}

/** 管理者向け招待メール（日英併記）の件名・本文を組み立てる（送信はしない。文面の検証にも使う） */
export function renderAdminInvitationEmail({
  userName,
  inviteUrl,
  expiresDays = 3,
}: Omit<SendAdminInvitationParams, 'to'>): { subject: string; html: string } {
  const html = renderToString(React.createElement(AdminInviteEmailTemplate, { userName, inviteUrl, expiresDays }));
  return { subject: ADMIN_INVITATION_SUBJECT, html };
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
    const { subject, html } = renderAdminInvitationEmail({ userName, inviteUrl, expiresDays });
    const data = await sendCore({ to, subject, html });

    logger.info('mail:send_admin_invitation_success', `管理者招待メールを送信しました: ${to}`, { messageId: data?.id });
    return { success: true };

  } catch (err) {
    logger.error('mail:send_admin_invitation_failed', err instanceof Error ? err.message : 'Unknown error', { payload: { to } });
    return { success: false, error: err instanceof Error ? err.message : 'メール送信中に予期せぬエラーが発生しました。' };
  }
}
