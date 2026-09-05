'use server';

import {
  getMySessionsCore,
  getMyUpcomingSessionsCore,
  getMyPastSessionsCore,
  cancelSessionCore,
  rescheduleSessionCore,
  bookMakeupSessionCore,
  getSessionResultSummaryCore,
} from '@gabby/lib/session/actions/sessionActions';
import { getCoachAvailabilityByUserIdCore } from '@gabby/lib/coachAvailability/actions/coachAvailabilityActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { CoachAvailabilitySlot } from '@gabby/types/coachAvailability';
import { SessionActionErrorCode, SessionListItem, SessionResultSummary } from '@gabby/types/session';

const logger = createLogger('student');

const SESSION_ERROR_MESSAGES_JA: Record<SessionActionErrorCode, string> = {
  unauthorized: 'セッションの有効期限が切れました。再度ログインしてください。',
  invalid_input: '選択した日時をご確認ください。',
  not_found: '対象のセッションが見つかりませんでした。',
  not_actionable: 'このセッションは既に開始済み、または対応済みのため変更できません。',
  slot_unavailable: '選択した時間はコーチの対応可能時間外です。',
  schedule_conflict: '選択した時間には既に他のセッションの予定があります。',
  reason_required: '理由を入力してください。',
  no_ticket_available: '予約可能な未割当のチケットがありません。',
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
 * 指定コーチの空き時間一覧を取得する（振替時の候補時間表示用）
 */
export async function getCoachAvailabilityForReschedule(coachId: string): Promise<CoachAvailabilitySlot[]> {
  const result = await getCoachAvailabilityByUserIdCore(coachId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_coach_availability_failed', result.errorCode, ctx);
    return [];
  }
  return result.slots;
}

/**
 * 予定されているセッションをキャンセルする
 */
export async function cancelSession(
  sessionId: string,
  reason?: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await cancelSessionCore(sessionId, reason);

  if (!result.success) {
    logger.error('student:cancel_session_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:cancel_session_success', 'Session cancelled', ctx);
  return { success: true };
}

/**
 * 予定されているセッションをコーチの対応可能時間内で振替/日時変更する
 */
export async function rescheduleSession(
  sessionId: string,
  newDate: string,
  newStartTime: string,
  reason?: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await rescheduleSessionCore(sessionId, newDate, newStartTime, reason);

  if (!result.success) {
    logger.error('student:reschedule_session_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:reschedule_session_success', 'Session rescheduled', ctx);
  return { success: true };
}

/**
 * 未割当のチケット（キャンセルにより返還された枠）を、担当コーチ限定で新規に予約する
 */
export async function bookMakeupSession(
  scheduleId: string,
  newDate: string,
  newStartTime: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await bookMakeupSessionCore(scheduleId, newDate, newStartTime);

  if (!result.success) {
    logger.error('student:book_makeup_session_failed', result.errorCode, ctx);
    return { success: false, message: SESSION_ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:book_makeup_session_success', 'Makeup session booked', ctx);
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
