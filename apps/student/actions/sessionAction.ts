'use server';

import {
  getMySessionsCore,
  cancelSessionCore,
  rescheduleSessionCore,
} from '@gabby/lib/session/actions/sessionActions';
import { getCoachAvailabilityByUserIdCore } from '@gabby/lib/coachAvailability/actions/coachAvailabilityActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { CoachAvailabilitySlot } from '@gabby/types/coachAvailability';
import { SessionActionErrorCode, SessionListItem } from '@gabby/types/session';

const logger = createLogger('student');

const SESSION_ERROR_MESSAGES_JA: Record<SessionActionErrorCode, string> = {
  unauthorized: 'セッションの有効期限が切れました。再度ログインしてください。',
  invalid_input: '選択した日時をご確認ください。',
  not_found: '対象のレッスンが見つかりませんでした。',
  not_actionable: 'このレッスンは既に開始済み、または対応済みのため変更できません。',
  slot_unavailable: '選択した時間はコーチの対応可能時間外です。',
  schedule_conflict: '選択した時間には既に他のレッスンの予定があります。',
  reason_required: '理由を入力してください。',
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
 * 予定されているレッスンをキャンセルする
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
 * 予定されているレッスンをコーチの対応可能時間内で振替/日時変更する
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
