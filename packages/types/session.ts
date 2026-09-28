/**
 * ----------------------------------------------
 * 個別レッスンセッション（専属コーチマッチング機能）型定義
 * ----------------------------------------------
 */

// com_t_session.status
// 2026-09-14: 1〜10まで増殖していたステータスをscheduled/completed/cancelledの3値に簡素化した。
// 「完了時の内訳」はCOMPLETION_RESULTへ、「キャンセルの起因」はCANCEL_CATEGORYへ、それぞれ
// 直交する軸として分離している（詳細はtable/com_t_session.sqlのステータス簡素化パッチ参照）。
export const SESSION_STATUS = {
  SCHEDULED: 1,
  COMPLETED: 2,
  CANCELLED: 3,
} as const;
export type SessionStatus = typeof SESSION_STATUS[keyof typeof SESSION_STATUS];

// com_t_session.completion_result（status=COMPLETEDの内訳。status<>COMPLETEDの行では常にNULL）
export const COMPLETION_RESULT = {
  NORMAL: 1,
  EARLY_ENDED: 2,
  NO_SHOW: 3,
} as const;
export type CompletionResult = typeof COMPLETION_RESULT[keyof typeof COMPLETION_RESULT];

/**
 * resolve_stale_session RPCへ渡す「期限超過セッションの解決方法」。1〜3はCOMPLETION_RESULTと
 * 値を共有し、そのままcompletion_resultカラムに入る。COACH_NO_SHOW(4)のみ例外で、コーチ自身の
 * 無断欠席を意味し、DB上はcompletion_resultではなくstatus=CANCELLED/cancel_category=COACH
 * （コーチキャンセルと同義。チケットは常に返還される）として記録される。
 */
export const STALE_SESSION_RESOLUTION = {
  NORMAL: COMPLETION_RESULT.NORMAL,
  EARLY_ENDED: COMPLETION_RESULT.EARLY_ENDED,
  NO_SHOW: COMPLETION_RESULT.NO_SHOW,
  COACH_NO_SHOW: 4,
} as const;
export type StaleSessionResolution = typeof STALE_SESSION_RESOLUTION[keyof typeof STALE_SESSION_RESOLUTION];

// com_t_session.cancel_category（status=CANCELLEDの起因。status<>CANCELLEDの行では常にNULL）
export const CANCEL_CATEGORY = {
  STUDENT: 1,
  COACH: 2,
  ADMIN: 3,
  LICENSE_ENDED: 4,
  COACH_REASSIGNED: 5,
} as const;
export type CancelCategory = typeof CANCEL_CATEGORY[keyof typeof CANCEL_CATEGORY];

/** 生徒・コーチ本人操作によるキャンセル（変更履歴タブに表示する対象の判定に使う） */
export const SESSION_SELF_INITIATED_CANCEL_CATEGORIES: readonly CancelCategory[] = [
  CANCEL_CATEGORY.STUDENT,
  CANCEL_CATEGORY.COACH,
];

/**
 * カレンダーには表示すべきでないステータス（キャンセル済み）。振替後の新しいコマや、
 * 別の生徒の予約が同じ枠に入るケースがあるため、キャンセル済みの行をカレンダーに残すと
 * ノイズ・誤解のもとになる。担当外セッション（自分以外のコーチが担当したセッション）を
 * 一覧に混在させる際にも、キャンセル済みの行は参照価値が無いため同様に除外する。
 */
export const SESSION_NON_ACTIONABLE_STATUSES: readonly SessionStatus[] = [SESSION_STATUS.CANCELLED];

/** 実施結果があるステータス（結果画面への導線を出す対象。call_logが記録されている想定） */
export const SESSION_RESULT_STATUSES: readonly SessionStatus[] = [SESSION_STATUS.COMPLETED];

/**
 * 「変更履歴」タブに表示する対象の判定（生徒・コーチ本人起因のキャンセルのみ）。
 * ライセンス無効化・コーチ交代・アドミン代理操作（旧reschedule含む）はいずれも運用都合の
 * 内部処理であり、生徒・コーチの操作起因ではないため、変更履歴にもカレンダーにも
 * 一切表示しない（SESSION_NON_ACTIONABLE_STATUSESには含めて非表示対象にしつつ、
 * こちらの判定には含めない）。statusだけでは判定できないため、cancel_categoryも
 * 合わせて見る必要がある: `session.status === SESSION_STATUS.CANCELLED &&
 * session.cancel_category != null && SESSION_SELF_INITIATED_CANCEL_CATEGORIES.includes(session.cancel_category)`
 */
export function isSelfInitiatedCancel(session: { status: SessionStatus; cancel_category: CancelCategory | null }): boolean {
  return (
    session.status === SESSION_STATUS.CANCELLED &&
    session.cancel_category != null &&
    SESSION_SELF_INITIATED_CANCEL_CATEGORIES.includes(session.cancel_category)
  );
}

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
  completion_result: CompletionResult | null;
  cancel_category: CancelCategory | null;
  viewer_role: SessionViewerRole; // ログイン中ユーザーがこのセッションにおいて生徒/コーチのどちらか
  counterpart_id: string;
  counterpart_name: string;
  counterpart_timezone: string;
  rescheduled_from: string | null;
  cancel_reason: string | null;
  status_note: string | null;
}

export type SessionActionErrorCode =
  | 'unauthorized'
  | 'invalid_input'
  | 'not_found'
  | 'not_actionable'
  | 'schedule_conflict'
  | 'reason_required'
  | 'no_ticket_available'
  | 'unexpected_error';

export type CancelSessionResult =
  | { success: true }
  | { success: false; errorCode: SessionActionErrorCode };

/** cancel_session RPCに渡す、候補提案する時間1件分（最大3件まで。コーチ・生徒どちらのキャンセルでも使う） */
export interface ProposedSlotInput {
  start_datetime: string; // UTC ISO文字列
  end_datetime: string;
}

// com_t_session_slot_proposal.status のうち、振替候補(source_session_id IS NOT NULL)が
// 取り得る値のサブセット（2026-09-15、com_t_session_reschedule_proposalとの統合により
// EXPIREDの値が4→5に変更。DBのchk_slot_proposal_withdraw_scope制約により振替候補は
// WITHDRAWN(4)を取らない）
export const RESCHEDULE_PROPOSAL_STATUS = {
  PENDING: 1,
  ACCEPTED: 2,
  DECLINED: 3,
  EXPIRED: 5,
} as const;
export type RescheduleProposalStatus = typeof RESCHEDULE_PROPOSAL_STATUS[keyof typeof RESCHEDULE_PROPOSAL_STATUS];

// com_t_session_slot_proposal.proposed_by_role
export const PROPOSED_BY_ROLE = {
  STUDENT: 1,
  COACH: 2,
} as const;
export type ProposedByRole = typeof PROPOSED_BY_ROLE[keyof typeof PROPOSED_BY_ROLE];

/** com_t_session_slot_proposalのうち振替候補(source_session_id IS NOT NULL)の1行分。
 * キャンセル時に相手方へ提案された候補（コーチ・生徒いずれの提案も含む）。
 * session_id/proposal_idはDB上はそれぞれsource_session_id/proposal_idだが、
 * 呼び出し側(sessionActions.ts)がSELECT時にエイリアスして旧来の名前のまま返す。 */
export interface SessionRescheduleProposal {
  proposal_id: string;
  session_id: string;
  coach_id: string;
  student_id: string;
  proposed_start_datetime: string;
  proposed_end_datetime: string;
  status: RescheduleProposalStatus;
  proposed_by_role: ProposedByRole;
  expires_at: string;
  insert_date: string;
}

/** 同一セッションのキャンセルに紐づく候補提案をグルーピングした単位（UI表示・一括却下用） */
export interface SessionRescheduleProposalGroup {
  session_id: string;
  coach_id: string;
  student_id: string;
  proposed_by_role: ProposedByRole;
  /** グループ内で最も古い候補のinsert_date（一覧の並び替え用） */
  insert_date: string;
  candidates: SessionRescheduleProposal[];
}

/** 生徒側で表示する振替候補グループ（コーチ名を結合済み） */
export interface MyRescheduleProposalGroup extends SessionRescheduleProposalGroup {
  coach_name: string;
}

/** コーチ側の申請一覧で表示する振替候補グループ（生徒名・元セッション日時を結合済み） */
export interface IncomingRescheduleProposalGroup extends SessionRescheduleProposalGroup {
  student_name: string;
  original_session_start_datetime: string;
}

export type GetMyRescheduleProposalsResult =
  | { success: true; proposals: SessionRescheduleProposal[] }
  | { success: false; errorCode: SessionActionErrorCode };

/** 振替候補の承諾(accept_session_reschedule_proposal RPC)の結果 */
export type AcceptRescheduleProposalResult =
  | { success: true; newSessionId: string }
  | { success: false; errorCode: SessionActionErrorCode };

/** 振替候補の一括却下(decline_session_reschedule_proposals RPC)の結果 */
export type DeclineRescheduleProposalResult =
  | { success: true }
  | { success: false; errorCode: SessionActionErrorCode };

// com_t_session_slot_proposal.status のうち、自由予約リクエスト(source_session_id IS NULL)が
// 取り得る値のサブセット（2026-09-15、com_t_session_booking_requestとの統合。値自体は不変）
export const SESSION_BOOKING_REQUEST_STATUS = {
  PENDING: 1,
  APPROVED: 2,
  REJECTED: 3,
  WITHDRAWN: 4,
} as const;
export type SessionBookingRequestStatus = typeof SESSION_BOOKING_REQUEST_STATUS[keyof typeof SESSION_BOOKING_REQUEST_STATUS];

/** com_t_session_slot_proposalのうち自由予約リクエスト(source_session_id IS NULL)の1行分。
 * 未消化チケットによる自由日時の新規予約リクエスト。request_id/requested_start_datetime/
 * requested_end_datetimeはDB上はそれぞれproposal_id/proposed_start_datetime/
 * proposed_end_datetimeだが、呼び出し側(sessionActions.ts)がSELECT時にエイリアスして
 * 旧来の名前のまま返す。 */
export interface SessionBookingRequest {
  request_id: string;
  schedule_id: string;
  student_id: string;
  coach_id: string;
  requested_start_datetime: string;
  requested_end_datetime: string;
  reason: string | null;
  status: SessionBookingRequestStatus;
  reject_reason: string | null;
  insert_date: string;
}

/** 予約リクエスト作成(create_session_booking_request RPC)の結果 */
export type CreateSessionBookingRequestResult =
  | { success: true; requestId: string }
  | { success: false; errorCode: SessionActionErrorCode };

/** 予約リクエストの承認(approve_session_booking_request RPC)の結果 */
export type ApproveSessionBookingRequestResult =
  | { success: true; newSessionId: string }
  | { success: false; errorCode: SessionActionErrorCode };

/** 予約リクエストの却下/取下げの結果 */
export type RespondSessionBookingRequestResult =
  | { success: true }
  | { success: false; errorCode: SessionActionErrorCode };

/** コーチ・生徒それぞれのダブルブッキング有無(check_session_conflict RPC)の結果 */
export type CheckSessionConflictResult =
  | { success: true; coachConflict: boolean; studentConflict: boolean }
  | { success: false; errorCode: SessionActionErrorCode };

/** レッスン終了ボタン(finalize_session RPC)の結果。statusは常にCOMPLETEDが返る（内訳はcompletionResult） */
export type FinalizeSessionResult =
  | { success: true; status: SessionStatus; completionResult: CompletionResult; overlapSeconds: number }
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

/**
 * com_t_session_dialogue_log 1行分（このセッション中にコーチがダイアログプラクティス教材の
 * 教材リンクを開いた履歴。セッション結果画面のDialog Practice Historyで使用）。
 * あくまで「開いた」事実の記録であり、完了したことを意味しない。
 */
export interface SessionDialogueLogEntry {
  log_id: string;
  content_name: string;
  content_name_en: string | null;
  session_no: number;
  insert_date: string; // UTC ISO文字列（オープン日時）
}

/** レッスン結果画面のサマリー情報一式 */
export interface SessionResultSummary {
  session_id: string;
  start_datetime: string;
  end_datetime: string;
  status: SessionStatus;
  completion_result: CompletionResult | null;
  status_note: string | null;
  counterpart_name: string;
  counterpart_icon_path: string | null;
  call_log: SessionCallLogEntry[];
  chat_log: SessionChatMessageEntry[];
  sprint_log: SessionSprintSummaryEntry[];
  dialogue_log: SessionDialogueLogEntry[];
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

/** 確定済み(completed、内訳問わず)だが宿題が未投稿のセッション（直近の実施分に限定） */
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
