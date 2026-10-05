import * as React from 'react';
import { MailButton, NotifyMailFrame, mailTextStyle } from './NotifyMailFrame';

/** 通知メールの言語（student: ja / coach: en） */
export type NotificationMailLanguage = 'ja' | 'en';

export interface NotificationEmailTemplateProps {
  language: NotificationMailLanguage;
  recipientName: string | null;
  /** 通知のタイトル（アプリ内通知と同じ） */
  title: string;
  /** 通知の本文（アプリ内通知と同じ。チャットはメッセージの冒頭） */
  body: string;
  /** 本文を引用として表示する（チャットのメッセージ） */
  quoted?: boolean;
  /** アプリの該当画面のURL（宛先のポータル。無ければボタンを出さない） */
  actionUrl: string | null;
  /** メール通知の設定画面のURL（宛先のポータル） */
  settingsUrl: string | null;
}

const COPY = {
  ja: {
    greeting: (name: string | null) => (name ? `${name} さん` : 'Gabby Blueprint English をご利用の皆さま'),
    action: 'アプリで確認する',
    footer: 'このメールは、Gabby Blueprint English のお知らせとしてお送りしています。',
    settings: '通知のメールは、プロフィールの「メール通知」で停止できます（アプリ内の通知は引き続き届きます）。',
    settingsLink: 'メール通知の設定',
  },
  en: {
    greeting: (name: string | null) => (name ? `Hi ${name},` : 'Hello,'),
    action: 'Open in the app',
    footer: 'You are receiving this email as a notification from Gabby Blueprint English.',
    settings: 'You can turn off notification emails under "Email notifications" in your profile (in-app notifications will still be delivered).',
    settingsLink: 'Email notification settings',
  },
} as const;

/** 件名（言語ごと。通知のタイトルをそのまま使う） */
export function getNotificationSubject(language: NotificationMailLanguage, title: string): string {
  return language === 'en' ? `[Gabby Blueprint] ${title}` : `【Gabby Blueprint】${title}`;
}

/** 出来事の通知（予約・キャンセル・マッチング・チャット等）。アプリ内通知と同じ内容に、アプリへのボタンを添える */
export const NotificationEmailTemplate: React.FC<NotificationEmailTemplateProps> = ({
  language,
  recipientName,
  title,
  body,
  quoted = false,
  actionUrl,
  settingsUrl,
}) => {
  const copy = COPY[language];
  return (
    <NotifyMailFrame
      language={language}
      footerReason={copy.footer}
      settingsText={copy.settings}
      settingsUrl={settingsUrl}
      settingsLinkLabel={copy.settingsLink}
    >
      <p style={mailTextStyle}>{copy.greeting(recipientName)}</p>
      <p style={{ fontSize: '17px', fontWeight: 'bold', margin: '0 0 12px 0', color: '#111827' }}>{title}</p>
      {quoted ? (
        <p
          style={{
            fontSize: '15px',
            margin: '0 0 16px 0',
            padding: '12px 16px',
            backgroundColor: '#f3f5fb',
            borderLeft: '3px solid #0e3196',
            borderRadius: '4px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {body}
        </p>
      ) : (
        <p style={{ ...mailTextStyle, whiteSpace: 'pre-wrap' }}>{body}</p>
      )}
      {actionUrl && <MailButton href={actionUrl}>{copy.action}</MailButton>}
    </NotifyMailFrame>
  );
};
