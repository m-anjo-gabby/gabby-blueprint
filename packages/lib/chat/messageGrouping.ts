import { ChatMessage } from '@gabby/types/chat';

// Slackなどのグルーピング慣習に合わせ、同一送信者・同一カレンダー日・5分以内の連投は
// 見出し（アイコン・名前・日時）を省略してひとつながりのメッセージ群として扱う。
const GROUPING_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 直前のメッセージと連続した（＝見出しを省略すべき）メッセージかどうかを判定する。
 */
export function isContinuationMessage(current: ChatMessage, previous: ChatMessage | undefined): boolean {
  if (!previous) return false;
  if (current.sender_user_id !== previous.sender_user_id) return false;

  const currentDate = new Date(current.created_at);
  const previousDate = new Date(previous.created_at);
  if (currentDate.toDateString() !== previousDate.toDateString()) return false;

  return currentDate.getTime() - previousDate.getTime() <= GROUPING_INTERVAL_MS;
}

export interface FormatMessageHeaderTimeLabels {
  /** 例: 'ja-JP' / 'en-US' */
  locale: string;
  /** 例: '昨日' / 'Yesterday' */
  yesterdayLabel: string;
}

/**
 * メッセージ見出しの日時表示を組み立てる。
 * 当日: 時刻のみ / 前日: labels.yesterdayLabel + 時刻 / それ以前: 日付(+年) + 時刻
 */
export function formatMessageHeaderTime(iso: string, labels: FormatMessageHeaderTimeLabels): string {
  const date = new Date(iso);
  const now = new Date();
  const timeStr = date.toLocaleTimeString(labels.locale, { hour: '2-digit', minute: '2-digit' });

  if (date.toDateString() === now.toDateString()) {
    return timeStr;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `${labels.yesterdayLabel} ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString(labels.locale, {
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  return `${dateStr} ${timeStr}`;
}
