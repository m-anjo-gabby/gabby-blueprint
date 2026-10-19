'use server';

import {
  getSessionHomeworkCore,
  getRecentSessionHomeworkCore,
  createSessionHomeworkCore,
  addHomeworkCommentCore,
  setSessionHomeworkNotNeededCore,
} from '@gabby/lib/sessionHomework/actions/sessionHomeworkActions';
import { uploadSessionHomeworkAttachmentCore } from '@gabby/lib/sessionHomework/actions/homeworkAttachmentActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  type HomeworkAttachmentErrorCode,
  type PendingHomeworkAttachment,
  type SessionHomeworkComment,
  type SessionHomeworkEntry,
} from '@gabby/types/sessionHomework';
import type { ActionResult } from '@gabby/types/action';

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
 * 宿題の添付ファイル（本文・追記のコメント）を、投稿の前にアップロードする。
 * アップロードできるのは、そのセッションのコーチだけ。
 */
export async function uploadSessionHomeworkAttachment(
  sessionId: string,
  formData: FormData,
): Promise<ActionResult<{ attachment: PendingHomeworkAttachment }>> {
  const result = await uploadSessionHomeworkAttachmentCore(sessionId, formData);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:upload_homework_attachment_failed', result.errorCode, ctx);
    return { success: false, message: ATTACHMENT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, attachment: result.attachment };
}

/**
 * セッションの宿題の本文（追記のコメントを含む）を、投稿済みなら取得する。
 * 見られるのは、投稿したコーチと、宿題の相手の生徒。
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
 * その生徒の最近の宿題を、指定のセッションを除いて取得する
 * （セッションの準備・実施の画面で、移動せずに「前回の宿題」を出すのに使う）。
 */
export async function getRecentSessionHomework(
  studentId: string,
  excludeSessionId: string,
): Promise<SessionHomeworkEntry[]> {
  const result = await getRecentSessionHomeworkCore(studentId, excludeSessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_recent_session_homework_failed', result.errorCode, ctx);
    return [];
  }
  return result.entries;
}

/**
 * セッションの宿題の本文（自由記述とアップロード済みの添付）を作る。コーチだけが、セッションごとに1つ作れ、編集・削除は無い
 * （投稿した宿題への操作）。そのセッションの宿題が投稿済みなら 'already_exists' で失敗する
 * （追記は addHomeworkComment を使う）。
 */
export async function createSessionHomework(
  sessionId: string,
  homeworkText: string,
  attachments: PendingHomeworkAttachment[] = [],
): Promise<ActionResult<{ entry: SessionHomeworkEntry }>> {
  const ctx = await getLogContext();
  const result = await createSessionHomeworkCore(sessionId, homeworkText, attachments);

  if (!result.success) {
    logger.error('coach:create_session_homework_failed', result.errorCode, ctx);
    const message =
      result.errorCode === 'already_exists'
        ? 'Homework was already posted for this session.'
        : 'Failed to post homework. Please try again.';
    return { success: false, message };
  }

  logger.info('coach:create_session_homework_success', 'Homework posted', ctx);
  return { success: true, entry: result.entry };
}

/**
 * 投稿済みのセッションの宿題に、追記のコメント（自由記述とアップロード済みの添付）を足す。
 * コーチだけが足せ、足すだけ（編集・削除は無い）。
 */
export async function addHomeworkComment(
  sessionId: string,
  commentText: string,
  attachments: PendingHomeworkAttachment[] = [],
): Promise<ActionResult<{ comment: SessionHomeworkComment }>> {
  const ctx = await getLogContext();
  const result = await addHomeworkCommentCore(sessionId, commentText, attachments);

  if (!result.success) {
    logger.error('coach:add_homework_comment_failed', result.errorCode, ctx);
    const message =
      result.errorCode === 'not_found'
        ? 'Homework has not been posted for this session yet.'
        : 'Failed to post comment. Please try again.';
    return { success: false, message };
  }

  logger.info('coach:add_homework_comment_success', 'Homework comment posted', ctx);
  return { success: true, comment: result.comment };
}

/**
 * 終わったセッションを「今回は宿題なし」にする（または外す）。ダッシュボードの
 * セッションのタスクに「宿題の未投稿」として出なくなる。
 */
export async function setSessionHomeworkNotNeeded(sessionId: string, notNeeded: boolean): Promise<ActionResult> {
  const ctx = await getLogContext();
  const result = await setSessionHomeworkNotNeededCore(sessionId, notNeeded);
  if (!result.success) {
    logger.error('coach:set_session_homework_not_needed_failed', result.errorCode, ctx);
    return { success: false, message: 'Failed to update. Please try again.' };
  }
  return { success: true };
}
