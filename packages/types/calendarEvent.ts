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
 * 担当コーチ（com_t_calendar_event_coach）の選択肢・表示用の軽量型
 * 生徒/コーチ本人によるRSVP参加登録（is_joined）とは別概念で、
 * 管理者がグループセッションに割り当てる担当コーチを表す。
 */
export interface CalendarEventCoachOption {
  coach_id: string;
  user_name: string | null;
}

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
  // 結合フィールド（生徒/コーチ向けクエリでのみ計算。com_t_calendar_event_participantから結合）
  is_joined: boolean;
  // 結合フィールド（コーチ向けクエリでのみ計算。com_t_calendar_event_coachから結合。
  // TRUEの場合、このコーチはRSVP参加者ではなく担当コーチ（主催者側）である）
  is_assigned_coach: boolean;
  // 結合フィールド（管理画面一覧でのみ計算。com_t_calendar_event_coachから結合）
  coaches?: CalendarEventCoachOption[];
}

/**
 * アナウンス添付ファイル情報（JSONB格納形式）
 * Supabase Storage の calendar-event-message バケットに格納
 */
export interface CalendarEventMessageAttachment {
  id: string;
  name: string;
  path: string;
  size: number;
  mime_type: string;
}

/**
 * カレンダーイベントのアナウンス（com_t_calendar_event_message）のデータ型
 * 管理者から参加者/担当コーチへの一方向メッセージ配信。返信・既読管理は持たない。
 */
export interface CalendarEventMessageItem {
  calendar_event_message_id: string;
  calendar_event_id: string;
  title: string;
  content: string;
  attachments: CalendarEventMessageAttachment[];
  insert_date: string; // UTC ISO文字列
  update_date: string; // UTC ISO文字列（insert_dateと異なる場合は編集済み）
}
