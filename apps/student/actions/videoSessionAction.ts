'use server';

import {
  getStudentLiveSessionRoomAccessCore,
  recordSessionCallJoinCore,
  recordSessionCallLeaveCore,
} from '@gabby/lib/liveSessionRoom/actions/liveSessionRoomActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { LiveSessionRoomAccess, LiveSessionRoomErrorCode } from '@gabby/types/liveSessionRoom';

const logger = createLogger('student');

const LIVE_SESSION_ROOM_ERROR_MESSAGES_JA: Record<LiveSessionRoomErrorCode, string> = {
  unauthorized: 'セッションの有効期限が切れました。再度ログインしてください。',
  forbidden: 'この操作を行う権限がありません。',
  not_eligible: 'この機能はライブセッション付きプランの方のみご利用いただけます。専属コーチのマッチングが完了しているかもご確認ください。',
  unexpected_error: '予期しないエラーが発生しました。',
};

/**
 * ログイン中の生徒が、指定した個別レッスンセッションのライブセッションルームに入室するためのアクセス情報（Zoom Video SDK署名等）を取得する
 */
export async function getMyLiveSessionRoomAccess(
  sessionId: string
): Promise<{ success: true; access: LiveSessionRoomAccess } | { success: false; message: string }> {
  const result = await getStudentLiveSessionRoomAccessCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_live_session_room_access_failed', result.errorCode, ctx);
    return { success: false, message: LIVE_SESSION_ROOM_ERROR_MESSAGES_JA[result.errorCode] };
  }
  return { success: true, access: result.access };
}

/**
 * この生徒が通話に入室したことを記録する。返るcall_log_idは退室時のrecordCallLeaveに渡す。
 */
export async function recordCallJoin(sessionId: string, zoomSessionId: string | null): Promise<string | null> {
  const result = await recordSessionCallJoinCore(sessionId, zoomSessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:record_call_join_failed', result.errorCode, ctx);
    return null;
  }
  return result.callLogId;
}

/**
 * この生徒が通話から退室したことを記録する。複数の退室経路から多重に呼ばれても安全。
 */
export async function recordCallLeave(callLogId: string): Promise<void> {
  await recordSessionCallLeaveCore(callLogId);
}
