import { toPreheader, type MailBlock, type MailContent, type MailLocale } from '../layout/document';
import { buildNotifyMail, type NotifyMailLinks } from './notifyMail';

export interface NotificationEmailTemplateProps {
  /** 生徒: ja / コーチ: en */
  language: MailLocale;
  recipientName: string | null;
  /** 通知のタイトル（アプリ内通知と同じ） */
  title: string;
  /** 通知の本文（アプリ内通知と同じ。チャットはメッセージの冒頭） */
  body: string;
  /** 本文を引用として表示する（チャットのメッセージ） */
  quoted?: boolean;
  /** アプリの該当画面のURL（宛先のポータル。無ければボタンを出さない） */
  actionUrl: string | null;
  links: NotifyMailLinks;
}

const COPY = {
  ja: {
    action: 'アプリで確認する',
    reason: 'このメールは、Gabby Blueprint English のお知らせとしてお送りしています。',
    chatTitle: (sender: string | null) => `${sender ? `${sender}さんから` : ''}新しいメッセージが届いています`,
    chatNoPreview: 'チャットを開いてご確認ください。',
  },
  en: {
    action: 'Open in the app',
    reason: 'You are receiving this email as a notification from Gabby Blueprint English.',
    chatTitle: (sender: string | null) => `New message${sender ? ` from ${sender}` : ''}`,
    chatNoPreview: 'Open the chat to read it.',
  },
} as const;

/** 出来事の通知（予約・キャンセル・マッチング等）。アプリ内通知と同じ内容に、アプリへのボタンを添える。件名は通知のタイトル */
export function buildNotificationMail({
  language,
  recipientName,
  title,
  body,
  quoted = false,
  actionUrl,
  links,
}: NotificationEmailTemplateProps): MailContent {
  const blocks: MailBlock[] = [{ kind: 'title', text: title }, quoted ? { kind: 'quote', text: body } : { kind: 'paragraph', text: body }];
  if (actionUrl) blocks.push({ kind: 'button', label: COPY[language].action, href: actionUrl });

  return buildNotifyMail({
    language,
    category: 'NOTIFICATION',
    subject: title,
    preheader: toPreheader(body),
    recipientName,
    blocks,
    reason: COPY[language].reason,
    links,
  });
}

/** チャットの新着（未読が続いた場合の1通）。メッセージの冒頭を引用で載せる（無ければチャットを開く案内） */
export function buildChatUnreadMail({
  senderName,
  preview,
  ...rest
}: Omit<NotificationEmailTemplateProps, 'title' | 'body' | 'quoted'> & {
  senderName: string | null;
  preview: string | null;
}): MailContent {
  const copy = COPY[rest.language];
  return buildNotificationMail({
    ...rest,
    title: copy.chatTitle(senderName),
    body: preview ?? copy.chatNoPreview,
    quoted: !!preview,
  });
}
