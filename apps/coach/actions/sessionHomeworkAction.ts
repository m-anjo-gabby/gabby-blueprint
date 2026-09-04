'use server';

import { getSessionHomeworkCore, addSessionHomeworkCore } from '@gabby/lib/sessionHomework/actions/sessionHomeworkActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { PendingHomeworkAttachment, SessionHomeworkEntry } from '@gabby/types/sessionHomework';

const logger = createLogger('coach');

/**
 * Fetches the homework thread for a session (visible to the coach who posted it and the student it's for).
 */
export async function getSessionHomework(sessionId: string): Promise<SessionHomeworkEntry[]> {
  const result = await getSessionHomeworkCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_session_homework_failed', result.errorCode, ctx);
    return [];
  }
  return result.entries;
}

/**
 * Posts a homework entry (free text + already-uploaded attachments) for a session. Coach-only,
 * append-only — there is no edit/delete action for posted homework.
 */
export async function addSessionHomework(
  sessionId: string,
  homeworkText: string,
  attachments: PendingHomeworkAttachment[] = []
): Promise<{ success: true; entry: SessionHomeworkEntry } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await addSessionHomeworkCore(sessionId, homeworkText, attachments);

  if (!result.success) {
    logger.error('coach:add_session_homework_failed', result.errorCode, ctx);
    return { success: false, message: 'Failed to post homework. Please try again.' };
  }

  logger.info('coach:add_session_homework_success', 'Homework posted', ctx);
  return { success: true, entry: result.entry };
}
