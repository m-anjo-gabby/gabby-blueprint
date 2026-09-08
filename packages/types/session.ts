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
  CANCELLED_LICENSE_ENDED: 8,
  CANCELLED_COACH_REASSIGNED: 9,
} as const;
export type SessionStatus = typeof SESSION_STATUS[keyof typeof SESSION_STATUS];

/**
 * カレンダーには表示すべきでないステータス（キャンセル済み・振替元・ライセンス無効化や
 * コーチ交代による自動キャンセル）。振替後の新しいコマや、別の生徒の予約が同じ枠に入る
 * ケースがあるため、これらのステータスの行をカレンダーに残すとノイズ・誤解のもとになる。
 * 担当外セッション（自分以外のコーチが担当したセッション）を一覧に混在させる際にも、
 * これらのステータスは参照価値が無いため同様に除外する。
 */
export const SESSION_NON_ACTIONABLE_STATUSES: readonly SessionStatus[] = [
  SESSION_STATUS.CANCELLED_BY_STUDENT,
  SESSION_STATUS.CANCELLED_BY_COACH,
  SESSION_STATUS.RESCHEDULED,
  SESSION_STATUS.CANCELLED_LICENSE_ENDED,
  SESSION_STATUS.CANCELLED_COACH_REASSIGNED,
];

/** 実施結果があるステータス（結果画面への導線を出す対象。call_logが記録されている想定） */
export const SESSION_RESULT_STATUSES: readonly SessionStatus[] = [
  SESSION_STATUS.COMPLETED,
  SESSION_STATUS.NO_SHOW,
  SESSION_STATUS.EARLY_ENDED,
];

/**
 * 「変更履歴」タブに表示する対象（生徒・コーチ本人起因のキャンセル・振替のみ）。
 * ライセンス無効化(CANCELLED_LICENSE_ENDED)・コーチ交代(CANCELLED_COACH_REASSIGNED)は
 * いずれも運用都合の内部処理であり、生徒・コーチの操作起因ではないため、変更履歴にも
 * カレンダーにも一切表示しない（SESSION_NON_ACTIONABLE_STATUSESには含めて非表示対象に
 * しつつ、こちらの変更履歴用の集合には含めない）。
 */
export const SESSION_CHANGE_HISTORY_STATUSES: readonly SessionStatus[] = [
  SESSION_STATUS.CANCELLED_BY_STUDENT,
  SESSION_STATUS.CANCELLED_BY_COACH,
  SESSION_STATUS.RESCHEDULED,
];

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

/** cancel_session RPCに渡す、コーチ提案の候補時間1件分（最大3件まで） */
export interface ProposedSlotInput {
  start_datetime: string; // UTC ISO文字列
  end_datetime: string;
}

// com_t_session_reschedule_proposal.status
export const RESCHEDULE_PROPOSAL_STATUS = {
  PENDING: 1,
  ACCEPTED: 2,
  DECLINED: 3,
  EXPIRED: 4,
} as const;
export type RescheduleProposalStatus = typeof RESCHEDULE_PROPOSAL_STATUS[keyof typeof RESCHEDULE_PROPOSAL_STATUS];

/** com_t_session_reschedule_proposal 1行分。コーチキャンセル時に提案された振替候補 */
export interface SessionRescheduleProposal {
  proposal_id: string;
  session_id: string;
  coach_id: string;
  student_id: string;
  proposed_start_datetime: string;
  proposed_end_datetime: string;
  status: RescheduleProposalStatus;
  expires_at: string;
}

export type GetMyRescheduleProposalsResult =
  | { success: true; proposals: SessionRescheduleProposal[] }
  | { success: false; errorCode: SessionActionErrorCode };

/** 振替候補の承諾(accept_session_reschedule_proposal RPC)の結果 */
export type AcceptRescheduleProposalResult =
  | { success: true; newSessionId: string }
  | { success: false; errorCode: SessionActionErrorCode };

export type DeclineRescheduleProposalResult =
  | { success: true }
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

/** com_t_session_chat 1行分（レッスン結果画面のチャット履歴表示用） */
export interface SessionChatMessageEntry {
  chat_id: string;
  sender_role: 'coach' | 'student';
  message: string;
  created_at: string; // UTC ISO文字列
}

/** lesson_t_sprint 1行分（このセッション中に実施されたLesson Sprintの要約。セッション準備/実施ハブ・レッスン結果画面で共用） */
export interface SessionSprintSummaryEntry {
  lesson_sprint_id: string;
  content_name: string;
  content_name_en: string | null;
  question_type: string;
  difficulty_level: number;
  total_answered: number;
  total_evaluated: number;
  average_score: number | null;
  insert_date: string; // UTC ISO文字列
}

/** レッスン結果画面のサマリー情報一式 */
export interface SessionResultSummary {
  session_id: string;
  start_datetime: string;
  end_datetime: string;
  status: SessionStatus;
  status_note: string | null;
  counterpart_name: string;
  counterpart_icon_path: string | null;
  call_log: SessionCallLogEntry[];
  chat_log: SessionChatMessageEntry[];
  sprint_log: SessionSprintSummaryEntry[];
}

export type GetSessionResultSummaryResult =
  | { success: true; session: SessionResultSummary }
  | { success: false; errorCode: SessionActionErrorCode };

/** 対象session_idに、指定ロールの入退室ログが1件でも存在するか（コーチのダッシュボード/生徒詳細でEnd Lessonボタンの活性判定に使用） */
export type GetSessionCallLogPresenceResult =
  | { success: true; joinedBySessionId: Record<string, boolean> }
  | { success: false; errorCode: SessionActionErrorCode };

/**
 * ----------------------------------------------
 * ダッシュボードの"Session Tasks"パネル向け型定義
 * ----------------------------------------------
 * 専用のタスク管理テーブルは持たず、既存のセッション・宿題・スケジュールの各テーブルから
 * その場で導出する（バッチ処理を新設せずに済み、常に最新の状態を反映できるため）。
 */

/** 終了予定時刻を過ぎてもscheduledのまま未確定のセッション（End Session/Resolveが必要） */
export interface UnfinalizedSessionTask {
  session_id: string;
  student_id: string;
  student_name: string;
  start_datetime: string;
  end_datetime: string;
}

/** 確定済み(completed/no_show/early_ended)だが宿題が未投稿のセッション（直近の実施分に限定） */
export interface MissingHomeworkTask {
  session_id: string;
  student_id: string;
  student_name: string;
  start_datetime: string;
  status: SessionStatus;
}

/** コーチが担当する全生徒を横断した、定期スケジュール単位の未消化枠（振替予約が必要） */
export interface CoachLiveSessionShortfallItem {
  schedule_id: string;
  student_id: string;
  student_name: string;
  day_of_week: number;
  start_time: string; // "HH:MM:SS"（コーチのローカル時刻）
  expected_sessions: number;
  actual_sessions: number;
  shortfall: number;
}

export interface CoachSessionTasksSummary {
  unfinalizedSessions: UnfinalizedSessionTask[];
  missingHomeworkSessions: MissingHomeworkTask[];
  shortfalls: CoachLiveSessionShortfallItem[];
}

export type GetCoachSessionTasksResult =
  | { success: true; tasks: CoachSessionTasksSummary }
  | { success: false; errorCode: SessionActionErrorCode };
