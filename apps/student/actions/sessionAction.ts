'use server';

import {
  getMySessionsCore,
  getMyUpcomingSessionsCore,
  getMyPastSessionsCore,
  cancelSessionCore,
  createSessionBookingRequestCore,
  withdrawSessionBookingRequestCore,
  getMyBookingRequestsCore,
  checkSessionConflictCore,
  getSessionResultSummaryCore,
  getMyRescheduleProposalGroupsCore,
  acceptRescheduleProposalCore,
  declineRescheduleProposalsCore,
} from '@gabby/lib/session/actions/sessionActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  MyRescheduleProposalGroup,
  SessionActionErrorCode,
  SessionBookingRequest,
  SessionListItem,
  SessionResultSummary,
} from '@gabby/types/session';

const logger = createLogger('student');

const SESSION_ERROR_MESSAGES_JA: Record<SessionActionErrorCode, string> = {
  unauthorized: 'セッションの有効期限が切れました。再度ログインしてください。',
  invalid_input: '選択した日時をご確認ください。',
  not_found: '対象のセッションが見つかりませんでした。',
  not_actionable: 'このセッションは既に開始済み、または対応済みのため変更できません。',
  schedule_conflict: '選択した時間には既に他のセッションの予定があります。',
  reason_required: '理由を入力してください。',
  no_ticket_available: '予約可能な未消化のセッションがありません。',
  unexpected_error: '予期しないエラーが発生しました。',
};

/**
 * ログイン中の生徒の、指定期間内のセッション一覧を取得する（カレンダー画面用）
 */
export async function getMySessions(startIso: string, endIso: string): Promise<SessionListItem[]> {
  const result = await getMySessionsCore(startIso, endIso);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_my_sessions_failed', result.errorCode, ctx);
    return [];
  }
  return result.sessions;
}

/**
 * ログイン中の生徒の、今後予定されているセッション一覧を取得する（ライブセッションハブのUpcomingタブ、
 * ダッシュボードの次回セッション表示用）
 */
export async function getMyUpcomingSessions(limit?: number): Promise<SessionListItem[]> {
  const result = await getMyUpcomingSessionsCore(limit);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_my_upcoming_sessions_failed', result.errorCode, ctx);
    return [];
  }
  return result.sessions;
}

/**
 * ログイン中の生徒の、確定済みの過去のセッション一覧を取得する（ライブセッションハブの
 * 契約別スケジュール/変更履歴表示用。ticketIdで契約を絞り込める）
 */
export async function getMyPastSessions(ticketId?: string, limit?: number): Promise<SessionListItem[]> {
  const result = await getMyPastSessionsCore(ticketId, limit);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_my_past_sessions_failed', result.errorCode, ctx);
    return [];
  }
  return result.sessions;
}

/**
 * 予定されているセッションをキャンセルする。proposedSlots を渡すと、その場でコーチへ
 * 振替候補（最大3件、任意）を提案する。
 */
export async function cancelSession(
  sessionId: string,
  reason?: string,
  proposedSlots?: { start_datetime: string; end_datetime: string }[]
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await cancelSessionCore(sessionId, reason, proposedSlots);

  if (!result.success) {
    logger.error('student:cancel_session_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:cancel_session_success', 'Session cancelled', ctx);
  return { success: true };
}

/**
 * コーチ・生徒それぞれのダブルブッキング有無を事前チェックする（候補提案・予約リクエストの
 * 日時入力中に呼び、インラインでエラーメッセージを表示するために使う）。
 */
export async function checkSessionConflict(
  coachId: string,
  studentId: string,
  startIso: string,
  endIso: string,
  excludeSessionId?: string
): Promise<{ success: true; coachConflict: boolean; studentConflict: boolean } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await checkSessionConflictCore(coachId, studentId, startIso, endIso, excludeSessionId);

  if (!result.success) {
    logger.error('student:check_session_conflict_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_JA[result.errorCode] };
  }

  return { success: true, coachConflict: result.coachConflict, studentConflict: result.studentConflict };
}

/**
 * 未消化のセッション（未割当／キャンセルで返還されたもの）を使い、自由な日時で新規予約を
 * リクエストする。即時確定ではなく、担当コーチの承認を待つ。
 */
export async function createSessionBookingRequest(
  scheduleId: string,
  startIso: string,
  endIso: string,
  reason?: string
): Promise<{ success: true; requestId: string } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await createSessionBookingRequestCore(scheduleId, startIso, endIso, reason);

  if (!result.success) {
    logger.error('student:create_booking_request_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:create_booking_request_success', 'Session booking requested', ctx);
  return { success: true, requestId: result.requestId };
}

/**
 * コーチの応答を待たずに、自分の予約リクエスト（pending中）を取り下げる
 */
export async function withdrawSessionBookingRequest(
  requestId: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await withdrawSessionBookingRequestCore(requestId);

  if (!result.success) {
    logger.error('student:withdraw_booking_request_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:withdraw_booking_request_success', 'Session booking request withdrawn', ctx);
  return { success: true };
}

/**
 * ログイン中生徒本人の、コーチの承認待ち(pending)の予約リクエスト一覧を取得する
 */
export async function getMyBookingRequests(): Promise<SessionBookingRequest[]> {
  const result = await getMyBookingRequestsCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_my_booking_requests_failed', result.errorCode, ctx);
    return [];
  }
  return result.requests;
}

/**
 * ログイン中生徒宛の、未回答かつ未失効の振替候補一覧を、キャンセル(セッション)単位で
 * グルーピングして取得する（コーチが提案したもののみ）
 */
export async function getMyRescheduleProposalGroups(): Promise<MyRescheduleProposalGroup[]> {
  const result = await getMyRescheduleProposalGroupsCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_reschedule_proposals_failed', result.errorCode, ctx);
    return [];
  }
  return result.groups;
}

/**
 * コーチ提案の振替候補を承諾する
 */
export async function acceptRescheduleProposal(
  proposalId: string
): Promise<{ success: true; newSessionId: string } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await acceptRescheduleProposalCore(proposalId);

  if (!result.success) {
    logger.error('student:accept_reschedule_proposal_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:accept_reschedule_proposal_success', 'Reschedule proposal accepted', ctx);
  return { success: true, newSessionId: result.newSessionId };
}

/**
 * コーチ提案の振替候補を、同一セッション(キャンセル)単位でまとめて却下する
 */
export async function declineRescheduleProposals(
  sessionId: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await declineRescheduleProposalsCore(sessionId);

  if (!result.success) {
    logger.error('student:decline_reschedule_proposals_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:decline_reschedule_proposals_success', 'Reschedule proposals declined', ctx);
  return { success: true };
}

/**
 * セッション結果画面用。対象セッションの基本情報＋入退室ログ一覧を取得する
 * （RLSにより本人が関わるセッションのみ取得可能）
 */
export async function getSessionResultSummary(
  sessionId: string
): Promise<{ success: true; session: SessionResultSummary } | { success: false; message: string }> {
  const result = await getSessionResultSummaryCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_session_result_summary_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_JA[result.errorCode] };
  }
  return { success: true, session: result.session };
}
