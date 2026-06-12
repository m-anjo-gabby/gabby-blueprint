// packages/lib/mail/actions/sendInvitation.ts
import * as React from 'react';
import { renderToString } from 'react-dom/server.edge'; // App RouterのRSCで安全に動く軽量エクスポート
import { sendCore } from '../core';
import { InviteEmailTemplate } from '../templates/InviteEmailTemplate';
import { createLogger } from '../../logger'; // プロジェクト共通のロガー

const logger = createLogger('mail');

interface SendInvitationParams {
  to: string;
  userName: string;
  inviteUrl: string;
  expiresDays?: number; // 外部（Admin画面など）から可変対応。デフォルトは7
}

/**
 * 🔒 独自招待メールを組み立てて Resend 経由で送信する
 */
export async function sendInvitationEmail({ 
  to, 
  userName, 
  inviteUrl, 
  expiresDays = 7 
}: SendInvitationParams): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = { userName, inviteUrl, expiresDays };
    
    // 1. HTMLの生成（唯一のマスターデータ）
    const html = renderToString(React.createElement(InviteEmailTemplate, payload));

    // 2. コア共通関数を呼び出して送信
    const data = await sendCore({
      to,
      subject: '【Gabby Blueprint】会員登録手続きのご案内',
      html,
    });

    logger.info('mail:send_invitation_success', `招待メールを送信しました: ${to}`, { messageId: data?.id });
    return { success: true };

  } catch (err) {
    logger.error('mail:send_invitation_failed', err instanceof Error ? err.message : 'Unknown error', { payload: { to } });
    return { success: false, error: err instanceof Error ? err.message : 'メール送信中に予期せぬエラーが発生しました。' };
  }
}