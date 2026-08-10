import { ChatMessage } from '@gabby/types/chat';

// Slackなどのグルーピング慣習に合わせ、同一送信者・同一カレンダー日・5分以内の連投は
// 見出し（アイコン・名前・日時）を省略してひとつながりのメッセージ群として扱う。
const GROUPING_INTERVAL_MS = 5 * 60 * 1000;

// 「同一カレンダー日」の判定はプロフィールのタイムゾーンを基準に行う必要があるため、
// ブラウザのローカルタイムゾーンに依存する toDateString() は使わず、指定タイムゾーンでの
// 日付キー（YYYY-MM-DD）を算出して比較する。
function dateKeyInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    date
  );
}

/**
 * 直前のメッセージと連続した（＝見出しを省略すべき）メッセージかどうかを判定する。
 * @param timeZone 「同一カレンダー日」判定の基準とするIANAタイムゾーン名（通常はログインユーザーのプロフィール設定）
 */
export function isContinuationMessage(
  current: ChatMessage,
  previous: ChatMessage | undefined,
  timeZone: string
): boolean {
  if (!previous) return false;
  if (current.sender_user_id !== previous.sender_user_id) return false;

  const currentDate = new Date(current.created_at);
  const previousDate = new Date(previous.created_at);
  if (dateKeyInTimeZone(currentDate, timeZone) !== dateKeyInTimeZone(previousDate, timeZone)) return false;

  return currentDate.getTime() - previousDate.getTime() <= GROUPING_INTERVAL_MS;
}

export interface FormatMessageHeaderTimeLabels {
  /** 例: 'ja-JP' / 'en-US' */
  locale: string;
  /** 例: '昨日' / 'Yesterday' */
  yesterdayLabel: string;
  /** 表示に使うIANAタイムゾーン名（通常はログインユーザーのプロフィール設定） */
  timeZone: string;
}

/**
 * メッセージ見出しの日時表示を組み立てる。
 * 当日: 時刻のみ / 前日: labels.yesterdayLabel + 時刻 / それ以前: 日付(+年) + 時刻
 * 「当日」「前日」および表示される時刻・日付はすべて labels.timeZone を基準に算出する。
 */
export function formatMessageHeaderTime(iso: string, labels: FormatMessageHeaderTimeLabels): string {
  const date = new Date(iso);
  const now = new Date();
  const { locale, timeZone } = labels;
  const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone });

  const dateKey = dateKeyInTimeZone(date, timeZone);
  const todayKey = dateKeyInTimeZone(now, timeZone);
  if (dateKey === todayKey) {
    return timeStr;
  }

  const yesterdayKey = dateKeyInTimeZone(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone);
  if (dateKey === yesterdayKey) {
    return `${labels.yesterdayLabel} ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString(locale, {
    year: dateKey.slice(0, 4) === todayKey.slice(0, 4) ? undefined : 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone,
  });
  return `${dateStr} ${timeStr}`;
}
