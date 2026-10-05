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
import {
  EventReminderEmailTemplate,
  getEventReminderSubject,
  type EventReminderEmailTemplateProps,
  type ReminderMailLanguage,
} from './templates/EventReminderEmailTemplate';
import {
  NotificationEmailTemplate,
  getNotificationSubject,
  type NotificationEmailTemplateProps,
} from './templates/NotificationEmailTemplate';

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

/**
 * リマインダーに載せる開催日時を、受信者のタイムゾーンで組み立てる。
 * 例: ja「10月12日(日) 20:00〜21:00（日本時間）」/ en「Sun, Oct 12, 8:00 PM – 9:00 PM (GMT+9)」
 * 終了時刻が無い場合は開始時刻だけ（「20:00〜」）。
 */
export function formatReminderSchedule({
  startIso,
  endIso,
  timeZone,
  language,
}: {
  startIso: string;
  endIso: string | null;
  timeZone: string;
  language: ReminderMailLanguage;
}): string {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  if (language === 'ja') {
    const date = new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'long', day: 'numeric', weekday: 'short' }).format(start);
    const time = new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit' });
    const zone = timeZone === 'Asia/Tokyo' ? '日本時間' : timeZone;
    return `${date} ${time.format(start)}〜${end ? time.format(end) : ''}（${zone}）`;
  }
  const date = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(start);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  const zone =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(start).find((p) => p.type === 'timeZoneName')
      ?.value ?? timeZone;
  return `${date}, ${time.format(start)}${end ? ` – ${time.format(end)}` : ''} (${zone})`;
}

/** グループセッションのリマインダーの件名・本文を組み立てる */
export function renderEventReminderEmail(props: EventReminderEmailTemplateProps): RenderedEmail {
  const html = renderToString(React.createElement(EventReminderEmailTemplate, props));
  return { subject: getEventReminderSubject(props.language, props.lead, props.scheduleLabel), html };
}

/** 出来事の通知メール（予約・キャンセル・マッチング・チャット等）の件名・本文を組み立てる */
export function renderNotificationEmail(props: NotificationEmailTemplateProps): RenderedEmail {
  const html = renderToString(React.createElement(NotificationEmailTemplate, props));
  return { subject: getNotificationSubject(props.language, props.title), html };
}
