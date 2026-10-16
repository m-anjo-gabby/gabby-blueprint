import { formatZoneLabel } from '../../date/timezone';
import type { MailLocale } from '../layout/document';

/*
 * メールに載せる日時の短い形（件名・毎週の枠）。受信者のタイムゾーンで表す。
 * 本文の日時（日付・開始〜終了・タイムゾーン）は reminder.ts の formatReminderSchedule を使う。
 */

const JA_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

function weekdayIndex(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** 件名に付ける日時（タイムゾーンは本文に載せるため省く）。例: ja「10月8日(木) 19:00」/ en「Thu, Oct 8, 7:00 PM」 */
export function formatShortSchedule({ startIso, timeZone, language }: { startIso: string; timeZone: string; language: MailLocale }): string {
  const start = new Date(startIso);
  if (language === 'ja') {
    const date = new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'long', day: 'numeric', weekday: 'short' }).format(start);
    const time = new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit' }).format(start);
    return `${date} ${time}`;
  }
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(start);
}

/**
 * 毎週の枠（マッチング）。実際の回の日時（UTC）から、受信者のタイムゾーンでの曜日・時刻を求める
 * （枠はコーチの現地時刻で持つため、コーチの曜日・時刻をそのまま出すと時差で曜日がずれる）。
 * withZone=false は件名用。例: ja「毎週木曜 19:00〜19:25（日本時間・UTC+9）」/ en「Every Thu, 7:00 PM – 7:25 PM (Japan Time, UTC+9)」
 * zoneName は受信者のタイムゾーンの短い名前（マスタの short_name_*。受信者の言語のもの）。
 */
export function formatWeeklySlot({
  startIso,
  endIso,
  timeZone,
  zoneName,
  language,
  withZone = true,
}: {
  startIso: string;
  endIso: string | null;
  timeZone: string;
  zoneName?: string | null;
  language: MailLocale;
  withZone?: boolean;
}): string {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  const zone = withZone ? formatZoneLabel({ timeZone, name: zoneName, at: start, language }) : null;
  if (language === 'ja') {
    const time = new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit' });
    const range = withZone ? `${time.format(start)}〜${end ? time.format(end) : ''}` : time.format(start);
    return `毎週${JA_WEEKDAYS[weekdayIndex(start, timeZone)]}曜 ${range}${zone ? `（${zone}）` : ''}`;
  }
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(start);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  const range = withZone && end ? `${time.format(start)} – ${time.format(end)}` : time.format(start);
  return `Every ${weekday}, ${range}${zone ? ` (${zone})` : ''}`;
}
