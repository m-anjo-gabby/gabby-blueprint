import * as React from 'react';
import { MailButton, NotifyMailFrame, mailTextStyle } from './NotifyMailFrame';

/** リマインダーの言語（student: ja / coach: en） */
export type ReminderMailLanguage = 'ja' | 'en';

/** 開始のどれだけ前のリマインダーか */
export type ReminderLead = '24h' | '1h';

export interface EventReminderEmailTemplateProps {
  language: ReminderMailLanguage;
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
  /** メール通知の設定画面のURL（宛先のポータル） */
  settingsUrl: string | null;
}

const COPY = {
  ja: {
    greeting: (name: string | null) => (name ? `${name} さん` : 'Gabby Blueprint English をご利用の皆さま'),
    lead: {
      '24h': '参加予定のグループセッションの開催が近づきました。日時をご確認ください。',
      '1h': '参加予定のグループセッションが、まもなく始まります。',
    },
    scheduleLabel: '日時',
    titleLabel: 'セッション',
    join: 'セッションに参加する',
    noJoinUrl: '参加用のリンクは、決まり次第アプリでお知らせします。',
    detail: 'アプリで詳細を見る',
    footer: 'このメールは、グループセッションに参加登録された方・担当コーチの方にお送りしています。',
    settings: 'リマインダーのメールは、プロフィールの「メール通知」で停止できます。',
    settingsLink: 'メール通知の設定',
  },
  en: {
    greeting: (name: string | null) => (name ? `Hi ${name},` : 'Hello,'),
    lead: {
      '24h': 'A group session you are taking part in is coming up. Please check the date and time.',
      '1h': 'A group session you are taking part in starts soon.',
    },
    scheduleLabel: 'Date & time',
    titleLabel: 'Session',
    join: 'Join the session',
    noJoinUrl: 'The join link will be shared in the app once it is ready.',
    detail: 'View details in the app',
    footer: 'You are receiving this email because you registered for, or are assigned to, this group session.',
    settings: 'You can turn off reminder emails under "Email notifications" in your profile.',
    settingsLink: 'Email notification settings',
  },
} as const;

/** 件名（言語・リマインダーの種類ごと） */
export function getEventReminderSubject(language: ReminderMailLanguage, lead: ReminderLead, scheduleLabel: string): string {
  if (language === 'en') {
    return lead === '1h' ? `[Gabby Blueprint] Your group session starts soon (${scheduleLabel})` : `[Gabby Blueprint] Upcoming group session: ${scheduleLabel}`;
  }
  return lead === '1h' ? `【Gabby Blueprint】まもなくグループセッションが始まります（${scheduleLabel}）` : `【Gabby Blueprint】グループセッションのご案内（${scheduleLabel}）`;
}

const labelStyle: React.CSSProperties = { fontSize: '12px', color: '#6b7280', margin: '0 0 2px 0' };
const valueStyle: React.CSSProperties = { fontSize: '15px', fontWeight: 'bold', margin: '0 0 12px 0', color: '#111827' };

/** グループセッションのリマインダー（24時間前・1時間前） */
export const EventReminderEmailTemplate: React.FC<EventReminderEmailTemplateProps> = ({
  language,
  lead,
  recipientName,
  title,
  seriesTitle,
  description,
  scheduleLabel,
  joinUrl,
  detailUrl,
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
        <p style={labelStyle}>{copy.titleLabel}</p>
        {seriesTitle && <p style={{ fontSize: '13px', color: '#4b5563', margin: '0 0 2px 0' }}>{seriesTitle}</p>}
        <p style={valueStyle}>{title}</p>
        <p style={labelStyle}>{copy.scheduleLabel}</p>
        <p style={valueStyle}>{scheduleLabel}</p>
        {description && (
          <p style={{ fontSize: '14px', color: '#4b5563', margin: '0 0 12px 0', whiteSpace: 'pre-wrap' }}>{description}</p>
        )}
      </div>

      {joinUrl ? <MailButton href={joinUrl}>{copy.join}</MailButton> : <p style={mailTextStyle}>{copy.noJoinUrl}</p>}

      {detailUrl && (
        <p style={{ ...mailTextStyle, textAlign: 'center' }}>
          <a href={detailUrl} style={{ color: '#0e3196' }}>
            {copy.detail}
          </a>
        </p>
      )}
    </NotifyMailFrame>
  );
};
