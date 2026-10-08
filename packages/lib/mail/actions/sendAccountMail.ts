// packages/lib/mail/actions/sendAccountMail.ts
import 'server-only';
import { USER_TYPES } from '@gabby/types/user';
import { sendCore } from '../core';
import { renderMail } from '../render';
import type { MailContent, MailLanguage } from '../layout/document';
import { buildAdminInviteMail } from '../templates/AdminInviteEmailTemplate';
import { buildCoachInviteMail } from '../templates/CoachInviteEmailTemplate';
import { buildStudentInviteMail } from '../templates/InviteEmailTemplate';
import { buildPasswordResetMail } from '../templates/PasswordResetEmailTemplate';
import { createLogger } from '../../logger';

/*
 * 🔒 アカウント関連のメール（招待・パスワード再設定）を組み立てて Resend 経由ですぐ送る。
 * 送信待ち（dispatch/）を通らず、配信停止の対象外。
 */

const logger = createLogger('mail');

/** 招待リンクの有効期限（日数）。招待の新規送信・再送の期限と、メール本文の期限表記で共通 */
export const INVITATION_EXPIRES_DAYS = 3;

export type AccountMailResult = { success: boolean; error?: string };

async function sendAccountMail({
  to,
  kind,
  mail,
  logName,
  label,
}: {
  to: string;
  /** Resend のタグ kind（到達状況の記録で見分ける） */
  kind: string;
  mail: MailContent;
  /** ログの名前（mail:<logName>_success / _failed） */
  logName: string;
  /** ログに出すメールの呼び名 */
  label: string;
}): Promise<AccountMailResult> {
  try {
    const data = await sendCore({ to, kind, ...renderMail(mail) });
    logger.info(`mail:${logName}_success`, `${label}を送信しました: ${to}`, { payload: { messageId: data?.id } });
    return { success: true };
  } catch (err) {
    logger.error(`mail:${logName}_failed`, err instanceof Error ? err.message : 'Unknown error', { err, payload: { to } });
    return { success: false, error: err instanceof Error ? err.message : 'メール送信中に予期せぬエラーが発生しました。' };
  }
}

/** ユーザー種別ごとの招待メール（管理者: 日英併記 / コーチ: 英語 / 生徒: 日本語） */
const INVITATIONS = {
  [USER_TYPES.ADMIN]: { kind: 'account_invite_admin', build: buildAdminInviteMail, logName: 'send_admin_invitation', label: '管理者招待メール' },
  [USER_TYPES.COACH]: { kind: 'account_invite_coach', build: buildCoachInviteMail, logName: 'send_coach_invitation', label: 'コーチ招待メール' },
  [USER_TYPES.STUDENT]: { kind: 'account_invite_student', build: buildStudentInviteMail, logName: 'send_invitation', label: '招待メール' },
} as const;

/** 招待メールを送る（ユーザー種別に合わせたテンプレート・文言。種別が無い・不明な場合は生徒向け） */
export async function sendInvitationEmail({
  to,
  userType,
  userName,
  inviteUrl,
  expiresDays = INVITATION_EXPIRES_DAYS,
}: {
  to: string;
  userType: string | undefined;
  /** 招待時の氏名。空ならテンプレート側の既定の宛名（会員様 / Dear Coach / 管理者様） */
  userName: string;
  inviteUrl: string;
  expiresDays?: number;
}): Promise<AccountMailResult> {
  const invitation =
    userType === USER_TYPES.ADMIN || userType === USER_TYPES.COACH ? INVITATIONS[userType] : INVITATIONS[USER_TYPES.STUDENT];
  return sendAccountMail({
    to,
    kind: invitation.kind,
    mail: invitation.build({ userName, inviteUrl, expiresDays }),
    logName: invitation.logName,
    label: invitation.label,
  });
}

/** パスワード再設定メールを送る */
export async function sendPasswordResetEmail({
  to,
  resetUrl,
  language,
}: {
  to: string;
  resetUrl: string;
  /** メールの言語（student: ja / coach: en / admin: bilingual） */
  language: MailLanguage;
}): Promise<AccountMailResult> {
  return sendAccountMail({
    to,
    kind: 'password_reset',
    mail: buildPasswordResetMail({ resetUrl, language }),
    logName: 'send_password_reset',
    label: `パスワードリセットメール（${language}）`,
  });
}
