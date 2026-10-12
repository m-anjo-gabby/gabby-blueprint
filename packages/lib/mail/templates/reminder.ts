import type { MailLocale } from '../layout/document';

/*
 * リマインダー（グループセッション・ライブセッション）の共通部分
 */

/** 開始のどれだけ前のリマインダーか */
export type ReminderLead = '24h' | '1h';

/** 送信待ちの payload.lead を読む（'1h' 以外は 24時間前として扱う） */
export function toReminderLead(value: unknown): ReminderLead {
  return value === '1h' ? '1h' : '24h';
}

/** 件名（サービス名の前置きを除いた部分）。noun はセッションの呼び名（例: ja「グループセッション」/ en「group session」） */
export function reminderSubject(language: MailLocale, lead: ReminderLead, noun: string, scheduleLabel: string): string {
  if (language === 'en') {
    return lead === '1h' ? `Your ${noun} starts soon (${scheduleLabel})` : `Upcoming ${noun}: ${scheduleLabel}`;
  }
  return lead === '1h' ? `まもなく${noun}が始まります（${scheduleLabel}）` : `${noun}のご案内（${scheduleLabel}）`;
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
  language: MailLocale;
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
