import { toPreheader, type MailBlock, type MailContent, type MailLocale } from '../layout/document';
import { notificationSubject, type NotificationMailDetails } from './notificationDetails';
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
  /** 対象の日時・振替候補・理由（予約・キャンセル・マッチング。buildNotificationDetails） */
  details?: NotificationMailDetails | null;
  links: NotifyMailLinks;
}

const COPY = {
  ja: {
    action: 'アプリで確認する',
    reason: 'このメールは、Gabby Blueprint のお知らせとしてお送りしています。',
    chatTitle: (sender: string | null) => `${sender ? `${sender}さんから` : ''}新しいメッセージが届いています`,
    chatNoPreview: 'チャットを開いてご確認ください。',
  },
  en: {
    action: 'Open in the app',
    reason: 'You are receiving this email as a notification from Gabby Blueprint.',
    chatTitle: (sender: string | null) => `New message${sender ? ` from ${sender}` : ''}`,
    chatNoPreview: 'Open the chat to read it.',
  },
} as const;

/**
 * 出来事の通知（予約・キャンセル・マッチング等）。アプリ内通知と同じ内容に、対象の日時等とアプリへのボタンを添える。
 * 件名は通知のタイトル（対象の日時があれば括弧書きで付ける）
 */
export function buildNotificationMail({
  language,
  recipientName,
  title: notificationTitle,
  body,
  quoted = false,
  actionUrl,
  details,
  links,
}: NotificationEmailTemplateProps): MailContent {
  const title = details?.title ?? notificationTitle;
  const blocks: MailBlock[] = [{ kind: 'title', text: title }, quoted ? { kind: 'quote', text: body } : { kind: 'paragraph', text: body }];
  if (details?.block) blocks.push(details.block);
  if (actionUrl) blocks.push({ kind: 'button', label: COPY[language].action, href: actionUrl });

  return buildNotifyMail({
    language,
    category: 'NOTIFICATION',
    subject: notificationSubject(language, details?.subjectBase ?? title, details?.subjectSuffix ?? null),
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
