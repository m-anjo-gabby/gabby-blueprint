import { toPreheader, type MailBlock, type MailDocument } from '../layout/document';
import { notifyFooter } from '../layout/footers';

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
  /** ログイン不要の配信停止のURL（無ければ案内を出さない） */
  unsubscribeUrl?: string | null;
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
export function buildNotificationMail({
  language,
  recipientName,
  title,
  body,
  quoted = false,
  actionUrl,
  settingsUrl,
  unsubscribeUrl,
}: NotificationEmailTemplateProps): MailDocument {
  const copy = COPY[language];
  const blocks: MailBlock[] = [
    { kind: 'paragraph', text: copy.greeting(recipientName) },
    { kind: 'title', text: title },
    quoted ? { kind: 'quote', text: body } : { kind: 'paragraph', text: body },
  ];
  if (actionUrl) blocks.push({ kind: 'button', label: copy.action, href: actionUrl });

  return {
    language,
    preheader: toPreheader(body),
    blocks,
    footer: notifyFooter({
      language,
      reason: copy.footer,
      settingsText: copy.settings,
      settingsUrl,
      settingsLabel: copy.settingsLink,
      unsubscribeUrl,
    }),
  };
}
