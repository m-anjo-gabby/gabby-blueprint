/**
 * ----------------------------------------------
 * カレンダーイベント（com_m_calendar_event）型定義
 * グループセッション・メンテナンス告知等、生徒/コーチ全体・特定顧客に配信する
 * 共有カレンダーイベント。com_t_session（1:1ライブセッション）とは別テーブル。
 * ----------------------------------------------
 */

// イベント種別。DB(event_type)はフリーテキストのため、正本はこの定数オブジェクト。
// 今後イベント種別が増える場合はこの定数にエントリを追加するだけでよい。
//   homeDisplay: 生徒ホームでの見せ方（feature: 参加を促すカードに出す / none: ホームには出さない）
//   rsvpRequired: 参加登録を必須にする（参加URLは参加登録した人だけに表示する。アドミンの登録時に強制する）
export const CALENDAR_EVENT_TYPES = {
  GROUP_SESSION: {
    label: 'グループセッション',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-100',
    dotClassName: 'bg-teal-500',
    homeDisplay: 'feature',
    rsvpRequired: true,
  },
  MAINTENANCE: {
    label: 'メンテナンス',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    dotClassName: 'bg-slate-400',
    homeDisplay: 'none',
    rsvpRequired: false,
  },
} as const satisfies Record<
  string,
  { label: string; badgeClass: string; dotClassName: string; homeDisplay: 'feature' | 'none'; rsvpRequired: boolean }
>;
export type CalendarEventType = keyof typeof CALENDAR_EVENT_TYPES;

/** 終了時刻を持たないイベントの、開催中とみなす長さ（参加の受付・「開催中」の表示に使う） */
export const CALENDAR_EVENT_DEFAULT_DURATION_MS = 60 * 60 * 1000;

/** イベントの開催状況（開催前 / 開催中 / 終了） */
export type CalendarEventPhase = 'upcoming' | 'live' | 'ended';

/** イベントの開催状況を判定する（終了時刻が無い場合は開始から CALENDAR_EVENT_DEFAULT_DURATION_MS で終了とみなす） */
export function getCalendarEventPhase(
  event: Pick<CalendarEventItem, 'start_datetime' | 'end_datetime'>,
  nowMs: number
): CalendarEventPhase {
  const startMs = new Date(event.start_datetime).getTime();
  const endMs = event.end_datetime ? new Date(event.end_datetime).getTime() : startMs + CALENDAR_EVENT_DEFAULT_DURATION_MS;
  if (nowMs < startMs) return 'upcoming';
  if (nowMs < endMs) return 'live';
  return 'ended';
}

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
 * シリーズ（com_m_calendar_event_series）の表示用の情報（各回に結合して返す）
 */
export interface CalendarEventSeriesSummary {
  series_id: string;
  title: string;
  description: string | null;
}

/**
 * シリーズ（com_m_calendar_event_series）の管理画面用のデータ型
 */
export interface CalendarEventSeriesItem extends CalendarEventSeriesSummary {
  event_type: CalendarEventType;
  insert_date: string;
  update_date: string;
  /** 回の数（論理削除を除く） */
  session_count: number;
  /** これから始まる直近の回の開始日時（無ければ null） */
  next_start_datetime: string | null;
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
  /** シリーズID（単発のイベントは null） */
  series_id: string | null;
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
  // 結合フィールド（担当コーチ。管理画面一覧と、生徒/コーチ向けの取得で付加する。com_t_calendar_event_coachから結合）
  coaches?: CalendarEventCoachOption[];
  // 結合フィールド（シリーズ。シリーズに属する回のみ。com_m_calendar_event_seriesから結合）
  series?: CalendarEventSeriesSummary | null;
  // 結合フィールド（アナウンス。生徒/コーチ向けの取得で付加する。com_t_calendar_event_messageから結合。新しい順）
  // RLS により参加者本人・担当コーチにだけ返る。null は未取得（参加状態が変わった直後等。詳細を開いた時に取得する）
  messages?: CalendarEventMessageItem[] | null;
}

/**
 * 参加登録・取消を一覧の行に反映する。アナウンスは参加状態で見える範囲が変わる（RLS）ため未取得に戻す。
 */
export function withParticipation(event: CalendarEventItem, isJoined: boolean): CalendarEventItem {
  return { ...event, is_joined: isJoined, messages: null };
}

/** アナウンスを新しい順に並べる */
export function sortCalendarEventMessages(messages: CalendarEventMessageItem[]): CalendarEventMessageItem[] {
  return messages.slice().sort((a, b) => b.insert_date.localeCompare(a.insert_date));
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
