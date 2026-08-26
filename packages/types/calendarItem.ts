/**
 * ----------------------------------------------
 * 学生向けカレンダー統合ビューモデル
 * ----------------------------------------------
 * com_t_session（1:1ライブセッション、個人予約・アクション可能）と
 * com_m_calendar_event（共有配信イベント、読み取り専用）は項目もアクション可否も
 * 異なるため、判別可能なユニオン型でまとめる。
 *
 * 将来イベント種別が増える場合は CalendarEventItem.event_type（フリーテキスト＋
 * TS定数辞書）への追加だけで済み、本ユニオン自体の変更は不要。com_t_session の
 * ような構造的に異なる新テーブルが増えた場合のみ、ユニオンメンバーを1つ増やす。
 */
import { SessionListItem } from './session';
import { CalendarEventItem } from './calendarEvent';

export type CalendarItem =
  | { kind: 'session'; date: string /* YYYY-MM-DD, viewer timezone */; data: SessionListItem }
  | { kind: 'calendar_event'; date: string; data: CalendarEventItem };

export function getCalendarItemKey(item: CalendarItem): string {
  return item.kind === 'session' ? item.data.session_id : item.data.calendar_event_id;
}
