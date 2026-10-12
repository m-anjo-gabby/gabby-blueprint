'use server';

import {
  getSessionHomeworkCore,
  getRecentSessionHomeworkCore,
  createSessionHomeworkCore,
  addHomeworkCommentCore,
  getHomeworkChecklistCore,
} from '@gabby/lib/sessionHomework/actions/sessionHomeworkActions';
import { uploadSessionHomeworkAttachmentCore } from '@gabby/lib/sessionHomework/actions/homeworkAttachmentActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  HomeworkAttachmentErrorCode,
  PendingHomeworkAttachment,
  SessionHomeworkChecklistItem,
  SessionHomeworkComment,
  SessionHomeworkEntry,
} from '@gabby/types/sessionHomework';

const logger = createLogger('coach');

const ATTACHMENT_ERROR_MESSAGES_EN: Record<HomeworkAttachmentErrorCode, string> = {
  no_file: 'No file was selected.',
  file_too_large: 'File size must be 10MB or less.',
  unsupported_type: 'This file type is not supported. Use an image, PDF, text, Word or Excel file.',
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: "You don't have permission to post homework for this session.",
  upload_failed: 'Failed to upload the file. Please try again.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * Uploads a homework attachment (body or follow-up comment) before posting it.
 * Only the session's own coach can upload.
 */
export async function uploadSessionHomeworkAttachment(
  sessionId: string,
  formData: FormData
): Promise<{ success: true; attachment: PendingHomeworkAttachment } | { success: false; message: string }> {
  const result = await uploadSessionHomeworkAttachmentCore(sessionId, formData);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:upload_homework_attachment_failed', result.errorCode, ctx);
    return { success: false, message: ATTACHMENT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, attachment: result.attachment };
}

/**
 * Fetches the homework body (with follow-up comments) for a session, if posted yet.
 * Visible to the coach who posted it and the student it's for.
 */
export async function getSessionHomework(sessionId: string): Promise<SessionHomeworkEntry | null> {
  const result = await getSessionHomeworkCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_session_homework_failed', result.errorCode, ctx);
    return null;
  }
  return result.homework;
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
 * Creates the homework body (free text + already-uploaded attachments + optional initial
 * checklist items) for a session. Coach-only, one per session — there is no edit/delete
 * action for posted homework. Fails with 'already_exists' if homework was already posted
 * for this session (use addHomeworkComment for follow-ups instead).
 */
export async function createSessionHomework(
  sessionId: string,
  homeworkText: string,
  attachments: PendingHomeworkAttachment[] = [],
  initialChecklistItemTexts: string[] = []
): Promise<
  | { success: true; entry: SessionHomeworkEntry; checklistItems: SessionHomeworkChecklistItem[] }
  | { success: false; message: string }
> {
  const ctx = await getLogContext();
  const result = await createSessionHomeworkCore(sessionId, homeworkText, attachments, initialChecklistItemTexts);

  if (!result.success) {
    logger.error('coach:create_session_homework_failed', result.errorCode, ctx);
    const message = result.errorCode === 'already_exists' ? 'Homework was already posted for this session.' : 'Failed to post homework. Please try again.';
    return { success: false, message };
  }

  logger.info('coach:create_session_homework_success', 'Homework posted', ctx);
  return { success: true, entry: result.entry, checklistItems: result.checklistItems };
}

/**
 * Adds a follow-up comment (free text + already-uploaded attachments) to the already-posted
 * homework for a session. Coach-only, append-only.
 */
export async function addHomeworkComment(
  sessionId: string,
  commentText: string,
  attachments: PendingHomeworkAttachment[] = []
): Promise<{ success: true; comment: SessionHomeworkComment } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await addHomeworkCommentCore(sessionId, commentText, attachments);

  if (!result.success) {
    logger.error('coach:add_homework_comment_failed', result.errorCode, ctx);
    const message = result.errorCode === 'not_found' ? 'Homework has not been posted for this session yet.' : 'Failed to post comment. Please try again.';
    return { success: false, message };
  }

  logger.info('coach:add_homework_comment_success', 'Homework comment posted', ctx);
  return { success: true, comment: result.comment };
}

/**
 * Fetches the session's homework checklist (child of the homework body posted for this session).
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

