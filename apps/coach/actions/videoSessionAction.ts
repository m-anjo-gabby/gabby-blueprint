'use server';

import { getCoachLiveSessionRoomAccessCore } from '@gabby/lib/liveSessionRoom/actions/liveSessionRoomActions';
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
 * Fetches this coach's access info (Zoom Video SDK signature, etc.) for the live session room with the given student
 */
export async function getLiveSessionRoomAccess(
  studentId: string
): Promise<{ success: true; access: LiveSessionRoomAccess } | { success: false; message: string }> {
  const result = await getCoachLiveSessionRoomAccessCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_live_session_room_access_failed', result.errorCode, ctx);
    return { success: false, message: LIVE_SESSION_ROOM_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, access: result.access };
}
