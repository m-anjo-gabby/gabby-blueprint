import type { MailBlock, MailContent, MailLocale } from '../layout/document';
import { buildNotifyMail, type NotifyMailLinks } from './notifyMail';
import { reminderSubject, type ReminderLead } from './reminder';

export interface EventReminderEmailTemplateProps {
  /** 生徒: ja / コーチ: en */
  language: MailLocale;
  lead: ReminderLead;
  recipientName: string | null;
  title: string;
  /** シリーズ名（シリーズに属する回のみ。例: 「10月の発音グループセッション」） */
  seriesTitle?: string | null;
  description: string | null;
  /** 受信者のタイムゾーンで表した開催日時（例: 「10月12日(日) 20:00〜21:00（日本時間）」） */
  scheduleLabel: string;
  /** 参加URL（未設定の場合は null） */
  joinUrl: string | null;
  /** アプリで詳細を開くURL（宛先のポータル） */
  detailUrl: string | null;
  links: NotifyMailLinks;
}

const COPY = {
  ja: {
    noun: 'グループセッション',
    lead: {
      '24h': '参加予定のグループセッションの開催が近づきました。日時をご確認ください。',
      '1h': '参加予定のグループセッションが、まもなく始まります。',
    },
    scheduleLabel: '日時',
    titleLabel: 'セッション',
    join: 'セッションに参加する',
    noJoinUrl: '参加用のリンクは、決まり次第アプリでお知らせします。',
    detail: 'アプリで詳細を見る',
    reason: 'このメールは、グループセッションに参加登録された方・担当コーチの方にお送りしています。',
  },
  en: {
    noun: 'group session',
    lead: {
      '24h': 'A group session you are taking part in is coming up. Please check the date and time.',
      '1h': 'A group session you are taking part in starts soon.',
    },
    scheduleLabel: 'Date & time',
    titleLabel: 'Session',
    join: 'Join the session',
    noJoinUrl: 'The join link will be shared in the app once it is ready.',
    detail: 'View details in the app',
    reason: 'You are receiving this email because you registered for, or are assigned to, this group session.',
  },
} as const;

/** グループセッションのリマインダー（24時間前・1時間前） */
export function buildEventReminderMail({
  language,
  lead,
  recipientName,
  title,
  seriesTitle,
  description,
  scheduleLabel,
  joinUrl,
  detailUrl,
  links,
}: EventReminderEmailTemplateProps): MailContent {
  const copy = COPY[language];
  const blocks: MailBlock[] = [
    { kind: 'paragraph', text: copy.lead[lead] },
    {
      kind: 'details',
      rows: [
        { label: copy.titleLabel, value: title, sub: seriesTitle },
        { label: copy.scheduleLabel, value: scheduleLabel },
      ],
      note: description,
    },
    joinUrl ? { kind: 'button', label: copy.join, href: joinUrl } : { kind: 'paragraph', text: copy.noJoinUrl },
  ];
  if (detailUrl) blocks.push({ kind: 'link', label: copy.detail, href: detailUrl });

  return buildNotifyMail({
    language,
    category: 'REMINDER',
    subject: reminderSubject(language, lead, copy.noun, scheduleLabel),
    preheader: `${scheduleLabel} ${title}`,
    recipientName,
    blocks,
    reason: copy.reason,
    links,
  });
}
