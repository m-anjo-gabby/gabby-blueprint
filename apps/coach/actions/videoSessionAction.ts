'use server';

import {
  getCoachLiveSessionRoomAccessCore,
  recordSessionCallJoinCore,
  recordSessionCallLeaveCore,
  recordSessionChatMessageCore,
} from '@gabby/lib/liveSessionRoom/actions/liveSessionRoomActions';
import { LIVE_SESSION_EARLY_JOIN_BEFORE_MS } from '@gabby/lib/liveSessionRoom/constants';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import type { ActionResult } from '@gabby/types/action';
import { type LiveSessionRoomAccess, type LiveSessionRoomErrorCode } from '@gabby/types/liveSessionRoom';

const logger = createLogger('coach');
const EARLY_JOIN_MINUTES = LIVE_SESSION_EARLY_JOIN_BEFORE_MS / 60000;

const LIVE_SESSION_ROOM_ERROR_MESSAGES_EN: Record<LiveSessionRoomErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have access to this room.',
  not_eligible: 'This student is not currently assigned to you.',
  not_yet_available: `This session isn't open yet — you can join starting ${EARLY_JOIN_MINUTES} minutes before the scheduled start time.`,
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * そのレッスンのセッションのライブセッションのルームに入るための、このコーチの情報（Zoom Video SDK の署名等）を取得する
 */
export async function getLiveSessionRoomAccess(
  sessionId: string,
): Promise<ActionResult<{ access: LiveSessionRoomAccess }>> {
  const result = await getCoachLiveSessionRoomAccessCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_live_session_room_access_failed', result.errorCode, ctx);
    return { success: false, message: LIVE_SESSION_ROOM_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, access: result.access };
}

/**
 * そのレッスンのセッションの通話に、このコーチが入ったことを記録する。
 * 後で recordCallLeave に渡す call_log_id を返す。
 */
export async function recordCallJoin(sessionId: string, zoomSessionId: string | null): Promise<string | null> {
  const result = await recordSessionCallJoinCore(sessionId, zoomSessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:record_call_join_failed', result.errorCode, ctx);
    return null;
  }
  return result.callLogId;
}

/**
 * このコーチが通話を出たことを記録する。複数回・複数の退出の経路から呼んでもよい。
 */
export async function recordCallLeave(callLogId: string): Promise<void> {
  await recordSessionCallLeaveCore(callLogId);
}

/**
 * 通話中にこのコーチが送ったチャットのメッセージを com_t_session_chat に記録する。
 * chat-on-message が isSelf===true で届いた時だけ呼ぶ（両側で呼ぶと二重に保存される）。
 */
export async function recordChatMessage(sessionId: string, message: string): Promise<void> {
  await recordSessionChatMessageCore(sessionId, message);
}
