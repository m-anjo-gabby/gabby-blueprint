/**
 * ----------------------------------------------
 * 個別レッスンセッション（専属コーチマッチング機能）型定義
 * ----------------------------------------------
 */

// com_t_session.status
export const SESSION_STATUS = {
  SCHEDULED: 1,
  COMPLETED: 2,
  CANCELLED_BY_STUDENT: 3,
  CANCELLED_BY_COACH: 4,
  RESCHEDULED: 5,
  NO_SHOW: 6,
} as const;
export type SessionStatus = typeof SESSION_STATUS[keyof typeof SESSION_STATUS];

export type SessionViewerRole = 'student' | 'coach';

/**
 * カレンダー表示用のセッション一覧アイテム。
 * ログイン中ユーザーが生徒・コーチいずれの立場でも同じ形で扱えるよう、
 * 相手方の情報を counterpart_* に正規化して持つ。
 */
export interface SessionListItem {
  session_id: string;
  schedule_id: string;
  start_datetime: string; // UTC ISO文字列
  end_datetime: string;
  status: SessionStatus;
  viewer_role: SessionViewerRole; // ログイン中ユーザーがこのセッションにおいて生徒/コーチのどちらか
  counterpart_id: string;
  counterpart_name: string;
  rescheduled_from: string | null;
  cancel_reason: string | null;
}

export type SessionActionErrorCode =
  | 'unauthorized'
  | 'invalid_input'
  | 'not_found'
  | 'not_actionable'
  | 'slot_unavailable'
  | 'schedule_conflict'
  | 'unexpected_error';

export type CancelSessionResult =
  | { success: true }
  | { success: false; errorCode: SessionActionErrorCode };

export type RescheduleSessionResult =
  | { success: true; newSessionId: string }
  | { success: false; errorCode: SessionActionErrorCode };
