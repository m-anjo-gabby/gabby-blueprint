'use server';

import {
  getCoachLiveSessionRoomAccessCore,
  recordSessionCallJoinCore,
  recordSessionCallLeaveCore,
} from '@gabby/lib/liveSessionRoom/actions/liveSessionRoomActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { LiveSessionRoomAccess, LiveSessionRoomErrorCode } from '@gabby/types/liveSessionRoom';

const logger = createLogger('coach');

const LIVE_SESSION_ROOM_ERROR_MESSAGES_EN: Record<LiveSessionRoomErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have access to this room.',
  not_eligible: 'This student is not currently assigned to you.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * Fetches this coach's access info (Zoom Video SDK signature, etc.) for the live session room of the given lesson session
 */
export async function getLiveSessionRoomAccess(
  sessionId: string
): Promise<{ success: true; access: LiveSessionRoomAccess } | { success: false; message: string }> {
  const result = await getCoachLiveSessionRoomAccessCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_live_session_room_access_failed', result.errorCode, ctx);
    return { success: false, message: LIVE_SESSION_ROOM_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, access: result.access };
}

/**
 * Records that this coach has joined the call for the given lesson session. Returns the
 * call_log_id to pass to recordCallLeave later.
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
 * Records that this coach has left the call. Safe to call multiple times / from multiple exit paths.
 */
export async function recordCallLeave(callLogId: string): Promise<void> {
  await recordSessionCallLeaveCore(callLogId);
}
