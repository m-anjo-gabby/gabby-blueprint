import type { MailBlock, MailContent, MailLocale } from '../layout/document';
import { buildNotifyMail, type NotifyMailLinks } from './notifyMail';
import { reminderSubject, type ReminderLead } from './reminder';
import { LIVE_SESSION_EARLY_JOIN_BEFORE_MS } from '../../liveSessionRoom/constants';

/** 入室できるのは開始の何分前からか（通話画面の判定と同じ値） */
const EARLY_JOIN_MINUTES = LIVE_SESSION_EARLY_JOIN_BEFORE_MS / 60000;

export interface LiveSessionReminderEmailTemplateProps {
  /** 生徒: ja / コーチ: en */
  language: MailLocale;
  lead: ReminderLead;
  recipientName: string | null;
  /** 相手の名前（生徒宛てはコーチ名、コーチ宛ては生徒名） */
  counterpartName: string | null;
  /** 受信者のタイムゾーンで表した日時（formatReminderSchedule） */
  scheduleLabel: string;
  /** 主ボタンの遷移先（生徒: ライブセッション画面 / コーチ: セッションハブ。宛先のポータル） */
  actionUrl: string | null;
  links: NotifyMailLinks;
}

const COPY = {
  ja: {
    noun: 'ライブセッション',
    lead: {
      '24h': 'ライブセッションの予定が近づきました。日時をご確認ください。',
      '1h': 'ライブセッションが、まもなく始まります。',
    },
    counterpartLabel: 'コーチ',
    scheduleLabel: '日時',
    action: { '24h': 'ライブセッションを確認する', '1h': 'ライブセッションを確認する' },
    joinNote: `開始${EARLY_JOIN_MINUTES}分前から入室できます。`,
    cancelNote: 'ご都合が悪くなった場合は、アプリのライブセッション画面からキャンセル・振替の手続きができます。',
    reason: 'このメールは、ライブセッションの予定がある方にお送りしています。',
  },
  en: {
    noun: 'live session',
    lead: {
      '24h': 'You have an upcoming live session. Please check the date and time.',
      '1h': 'Your live session starts soon.',
    },
    counterpartLabel: 'Student',
    scheduleLabel: 'Date & time',
    action: { '24h': 'View session', '1h': 'Open session' },
    joinNote: `You can join the call from ${EARLY_JOIN_MINUTES} minutes before the start time.`,
    cancelNote: null,
    reason: 'You are receiving this email because you have a scheduled live session.',
  },
} as const;

/** ライブセッションのリマインダー（24時間前・1時間前。生徒・コーチ） */
export function buildLiveSessionReminderMail({
  language,
  lead,
  recipientName,
  counterpartName,
  scheduleLabel,
  actionUrl,
  links,
}: LiveSessionReminderEmailTemplateProps): MailContent {
  const copy = COPY[language];
  const rows = [
    ...(counterpartName ? [{ label: copy.counterpartLabel, value: counterpartName }] : []),
    { label: copy.scheduleLabel, value: scheduleLabel },
  ];
  const blocks: MailBlock[] = [
    { kind: 'paragraph', text: copy.lead[lead] },
    { kind: 'details', rows },
  ];
  if (actionUrl) blocks.push({ kind: 'button', label: copy.action[lead], href: actionUrl });
  if (lead === '1h') blocks.push({ kind: 'paragraph', text: copy.joinNote, small: true, muted: true, center: true });
  if (copy.cancelNote && lead === '24h') blocks.push({ kind: 'paragraph', text: copy.cancelNote, small: true, muted: true });

  return buildNotifyMail({
    language,
    category: 'REMINDER',
    subject: reminderSubject(language, lead, copy.noun, scheduleLabel),
    preheader: [scheduleLabel, counterpartName].filter(Boolean).join(' '),
    recipientName,
    blocks,
    reason: copy.reason,
    links,
  });
}
