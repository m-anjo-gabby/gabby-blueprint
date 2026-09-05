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
  EARLY_ENDED: 7,
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
  status_note: string | null;
}

export type SessionActionErrorCode =
  | 'unauthorized'
  | 'invalid_input'
  | 'not_found'
  | 'not_actionable'
  | 'slot_unavailable'
  | 'schedule_conflict'
  | 'reason_required'
  | 'no_ticket_available'
  | 'unexpected_error';

export type CancelSessionResult =
  | { success: true }
  | { success: false; errorCode: SessionActionErrorCode };

export type RescheduleSessionResult =
  | { success: true; newSessionId: string }
  | { success: false; errorCode: SessionActionErrorCode };

/** 未割当チケットによる新規セッション予約(book_makeup_session RPC)の結果 */
export type BookMakeupSessionResult =
  | { success: true; newSessionId: string }
  | { success: false; errorCode: SessionActionErrorCode };

/** レッスン終了ボタン(finalize_session RPC)の結果 */
export type FinalizeSessionResult =
  | { success: true; status: SessionStatus; overlapSeconds: number }
  | { success: false; errorCode: SessionActionErrorCode };

/** 期限超過scheduledセッションの手動解決(resolve_stale_session RPC)の結果 */
export type ResolveStaleSessionResult =
  | { success: true }
  | { success: false; errorCode: SessionActionErrorCode };

/** com_t_session_call_log 1行分（レッスン結果画面の入退室タイムライン表示用） */
export interface SessionCallLogEntry {
  call_log_id: string;
  role: 'coach' | 'student';
  joined_at: string; // UTC ISO文字列
  left_at: string | null;
}

/** レッスン結果画面のサマリー情報一式 */
export interface SessionResultSummary {
  session_id: string;
  start_datetime: string;
  end_datetime: string;
  status: SessionStatus;
  status_note: string | null;
  counterpart_name: string;
  call_log: SessionCallLogEntry[];
}

export type GetSessionResultSummaryResult =
  | { success: true; session: SessionResultSummary }
  | { success: false; errorCode: SessionActionErrorCode };

/** 対象session_idに、指定ロールの入退室ログが1件でも存在するか（コーチのダッシュボード/生徒詳細でEnd Lessonボタンの活性判定に使用） */
export type GetSessionCallLogPresenceResult =
  | { success: true; joinedBySessionId: Record<string, boolean> }
  | { success: false; errorCode: SessionActionErrorCode };
