import * as React from 'react';
import { MailButton, NotifyMailFrame, mailTextStyle } from './NotifyMailFrame';
import type { ReminderLead, ReminderMailLanguage } from './EventReminderEmailTemplate';
import { LIVE_SESSION_EARLY_JOIN_BEFORE_MS } from '../../liveSessionRoom/constants';

/** 入室できるのは開始の何分前からか（通話画面の判定と同じ値） */
const EARLY_JOIN_MINUTES = LIVE_SESSION_EARLY_JOIN_BEFORE_MS / 60000;

export interface LiveSessionReminderEmailTemplateProps {
  /** 生徒: ja / コーチ: en */
  language: ReminderMailLanguage;
  lead: ReminderLead;
  recipientName: string | null;
  /** 相手の名前（生徒宛てはコーチ名、コーチ宛ては生徒名） */
  counterpartName: string | null;
  /** 受信者のタイムゾーンで表した日時（formatReminderSchedule） */
  scheduleLabel: string;
  /** 主ボタンの遷移先（1時間前は入室先、24時間前はセッションの確認先。宛先のポータル） */
  actionUrl: string | null;
  /** メール通知の設定画面のURL（宛先のポータル） */
  settingsUrl: string | null;
}

const COPY = {
  ja: {
    greeting: (name: string | null) => (name ? `${name} さん` : 'Gabby Blueprint English をご利用の皆さま'),
    lead: {
      '24h': 'ライブセッションの予定が近づきました。日時をご確認ください。',
      '1h': 'ライブセッションが、まもなく始まります。',
    },
    counterpartLabel: 'コーチ',
    scheduleLabel: '日時',
    action: { '24h': 'ライブセッションを確認する', '1h': '入室する' },
    joinNote: `開始${EARLY_JOIN_MINUTES}分前から入室できます。`,
    cancelNote: 'ご都合が悪くなった場合は、アプリのライブセッション画面からキャンセル・振替の手続きができます。',
    footer: 'このメールは、ライブセッションの予定がある方にお送りしています。',
    settings: 'リマインダーのメールは、プロフィールの「メール通知」で停止できます。',
    settingsLink: 'メール通知の設定',
  },
  en: {
    greeting: (name: string | null) => (name ? `Hi ${name},` : 'Hello,'),
    lead: {
      '24h': 'You have an upcoming live session. Please check the date and time.',
      '1h': 'Your live session starts soon.',
    },
    counterpartLabel: 'Student',
    scheduleLabel: 'Date & time',
    action: { '24h': 'View session', '1h': 'Open session' },
    joinNote: `You can join the call from ${EARLY_JOIN_MINUTES} minutes before the start time.`,
    cancelNote: null,
    footer: 'You are receiving this email because you have a scheduled live session.',
    settings: 'You can turn off reminder emails under "Email notifications" in your profile.',
    settingsLink: 'Email notification settings',
  },
} as const;

/** 件名（言語・リマインダーの種類ごと） */
export function getLiveSessionReminderSubject(language: ReminderMailLanguage, lead: ReminderLead, scheduleLabel: string): string {
  if (language === 'en') {
    return lead === '1h' ? `[Gabby Blueprint] Your live session starts soon (${scheduleLabel})` : `[Gabby Blueprint] Upcoming live session: ${scheduleLabel}`;
  }
  return lead === '1h' ? `【Gabby Blueprint】まもなくライブセッションが始まります（${scheduleLabel}）` : `【Gabby Blueprint】ライブセッションのご案内（${scheduleLabel}）`;
}

const labelStyle: React.CSSProperties = { fontSize: '12px', color: '#6b7280', margin: '0 0 2px 0' };
const valueStyle: React.CSSProperties = { fontSize: '15px', fontWeight: 'bold', margin: '0 0 12px 0', color: '#111827' };

/** ライブセッションのリマインダー（24時間前・1時間前。生徒・コーチ） */
export const LiveSessionReminderEmailTemplate: React.FC<LiveSessionReminderEmailTemplateProps> = ({
  language,
  lead,
  recipientName,
  counterpartName,
  scheduleLabel,
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
      <p style={mailTextStyle}>{copy.lead[lead]}</p>

      <div style={{ backgroundColor: '#f3f5fb', borderRadius: '8px', padding: '20px 20px 8px 20px', margin: '24px 0' }}>
        {counterpartName && (
          <>
            <p style={labelStyle}>{copy.counterpartLabel}</p>
            <p style={valueStyle}>{counterpartName}</p>
          </>
        )}
        <p style={labelStyle}>{copy.scheduleLabel}</p>
        <p style={valueStyle}>{scheduleLabel}</p>
      </div>

      {actionUrl && <MailButton href={actionUrl}>{copy.action[lead]}</MailButton>}
      {lead === '1h' && <p style={{ ...mailTextStyle, textAlign: 'center', fontSize: '13px', color: '#6b7280' }}>{copy.joinNote}</p>}
      {copy.cancelNote && lead === '24h' && <p style={{ ...mailTextStyle, fontSize: '13px', color: '#6b7280' }}>{copy.cancelNote}</p>}
    </NotifyMailFrame>
  );
};
