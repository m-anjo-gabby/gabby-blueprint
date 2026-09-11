'use server';

import {
  getSessionHomeworkCore,
  getRecentSessionHomeworkCore,
  addSessionHomeworkCore,
  getHomeworkChecklistCore,
  addHomeworkChecklistItemsCore,
} from '@gabby/lib/sessionHomework/actions/sessionHomeworkActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { PendingHomeworkAttachment, SessionHomeworkChecklistItem, SessionHomeworkEntry } from '@gabby/types/sessionHomework';

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
 * Fetches the most recent homework posts for this student, excluding the given session
 * (used by the session prep/execution hub to show "last homework" without navigating away).
 */
export async function getRecentSessionHomework(studentId: string, excludeSessionId: string): Promise<SessionHomeworkEntry[]> {
  const result = await getRecentSessionHomeworkCore(studentId, excludeSessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_recent_session_homework_failed', result.errorCode, ctx);
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

/**
 * Fetches the session's homework checklist (one checklist per session, independent of the
 * free-text homework messages above).
 */
export async function getSessionHomeworkChecklist(sessionId: string): Promise<SessionHomeworkChecklistItem[]> {
  const result = await getHomeworkChecklistCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_session_homework_checklist_failed', result.errorCode, ctx);
    return [];
  }
  return result.items;
}

/**
 * Adds one or more items to the session's homework checklist (coach-only). Existing items'
 * text can never be changed or removed, only new items appended, up to
 * HOMEWORK_CHECKLIST_MAX_ITEMS per session.
 */
export async function addHomeworkChecklistItems(
  sessionId: string,
  itemTexts: string[]
): Promise<{ success: true; items: SessionHomeworkChecklistItem[] } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await addHomeworkChecklistItemsCore(sessionId, itemTexts);

  if (!result.success) {
    logger.error('coach:add_homework_checklist_items_failed', result.errorCode, ctx);
    const message = result.errorCode === 'invalid_input' ? 'Checklist item is invalid or exceeds the maximum count.' : 'Failed to update checklist. Please try again.';
    return { success: false, message };
  }

  logger.info('coach:add_homework_checklist_items_success', 'Checklist items added', ctx);
  return { success: true, items: result.items };
}
