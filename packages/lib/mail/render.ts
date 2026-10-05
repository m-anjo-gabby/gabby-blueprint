// packages/lib/mail/render.ts
/**
 * メールの件名・本文の組み立て（送信はしない）
 *
 * 💡 送信処理（actions/*、core.ts）は 'server-only' でサーバー専用にしているため、
 * 文面の検証（testing/unit/*.test.ts、Node で実行）から読み込めるよう、組み立て処理だけをここに分けている。
 * API キー等の秘密情報を参照する処理はこのファイルに置かないこと。
 */
import * as React from 'react';
import { renderToString } from 'react-dom/server.edge'; // App RouterのRSCで安全に動く軽量エクスポート
import { ADMIN_INVITATION_SUBJECT, AdminInviteEmailTemplate } from './templates/AdminInviteEmailTemplate';
import {
  PASSWORD_RESET_SUBJECTS,
  PasswordResetEmailTemplate,
  type PasswordResetMailLanguage,
} from './templates/PasswordResetEmailTemplate';

/**
 * 再設定リンクの有効期限（分）。Supabase の Auth 設定「Email OTP Expiration」（supabase/config.toml の otp_expiry）と
 * 合わせること（dev・本番とも 1800秒＝30分）。メール本文の期限表記に使う。
 */
export const PASSWORD_RESET_LINK_TTL_MINUTES = 30;

interface RenderedEmail {
  subject: string;
  html: string;
}

/** パスワード再設定メールの件名・本文を組み立てる */
export function renderPasswordResetEmail({
  resetUrl,
  language,
}: {
  resetUrl: string;
  /** メールの言語（student: ja / coach: en / admin: bilingual） */
  language: PasswordResetMailLanguage;
}): RenderedEmail {
  const html = renderToString(
    React.createElement(PasswordResetEmailTemplate, {
      resetUrl,
      language,
      expiresInMinutes: PASSWORD_RESET_LINK_TTL_MINUTES,
    })
  );
  return { subject: PASSWORD_RESET_SUBJECTS[language], html };
}

/** 管理者向け招待メール（日英併記）の件名・本文を組み立てる */
export function renderAdminInvitationEmail({
  userName,
  inviteUrl,
  expiresDays = 3,
}: {
  /** 招待時の氏名。空ならテンプレート側の既定の宛名（管理者様 / Dear Administrator） */
  userName: string;
  inviteUrl: string;
  expiresDays?: number;
}): RenderedEmail {
  const html = renderToString(React.createElement(AdminInviteEmailTemplate, { userName, inviteUrl, expiresDays }));
  return { subject: ADMIN_INVITATION_SUBJECT, html };
}
