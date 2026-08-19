/**
 * ----------------------------------------------
 * カレンダーイベント（com_m_calendar_event）型定義
 * グループセッション・メンテナンス告知等、生徒/コーチ全体・特定顧客に配信する
 * 共有カレンダーイベント。com_t_session（1:1ライブセッション）とは別テーブル。
 * ----------------------------------------------
 */

// イベント種別。DB(event_type)はフリーテキストのため、正本はこの定数オブジェクト。
// 今後イベント種別が増える場合はこの定数にエントリを追加するだけでよい。
export const CALENDAR_EVENT_TYPES = {
  GROUP_SESSION: {
    label: 'グループセッション',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-100',
    dotClassName: 'bg-teal-500',
  },
  MAINTENANCE: {
    label: 'メンテナンス',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    dotClassName: 'bg-slate-400',
  },
} as const;
export type CalendarEventType = keyof typeof CALENDAR_EVENT_TYPES;

// 配信対象タイプ (ALL: 生徒全体 / CLIENT: 顧客単位 / COACH: コーチ全体)
export type CalendarEventTargetType = 'ALL' | 'CLIENT' | 'COACH';

/**
 * カレンダーイベントマスタ（com_m_calendar_event）のデータ型
 */
export interface CalendarEventItem {
  calendar_event_id: string;
  event_type: CalendarEventType;
  title: string;
  description: string | null;
  start_datetime: string; // UTC ISO文字列
  end_datetime: string | null; // NULL許容: 終了時刻を持たない告知
  location_url: string | null;
  target_type: CalendarEventTargetType;
  client_id: string | null;
  rsvp_enabled: boolean;
  is_published: boolean;
  delete_flg: string;
  insert_date: string;
  update_date: string;
  // 結合フィールド（生徒向けクエリでのみ計算。com_t_calendar_event_participantから結合）
  is_joined: boolean;
}
