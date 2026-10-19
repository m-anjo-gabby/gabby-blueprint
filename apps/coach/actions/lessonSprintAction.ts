'use server';

import {
  getAvailableSprintContentsCore,
  getLessonSprintQuestionsCore,
  createLessonSprintResultCore,
  getLessonSprintHistoryCore,
  getLessonSprintHistoryPageCore,
  getLessonSprintResultCore,
  updateLessonSprintSessionNoteCore,
} from '@gabby/lib/coachStudent/actions/lessonSprintActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  type CreateLessonSprintResultInput,
  type LessonSprintContentSummary,
  type LessonSprintHistoryListItem,
  type LessonSprintRecord,
} from '@gabby/types/lessonSprint';
import { type CoachStudentErrorCode } from '@gabby/types/coachStudent';
import { type SprintQuestion, type SprintQuestionType } from '@gabby/types/sprint';
import type { ActionResult } from '@gabby/types/action';

const logger = createLogger('coach');

const LESSON_SPRINT_ERROR_MESSAGES_EN: Record<CoachStudentErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have access to this student.',
  invalid_input: 'Please check your input and try again.',
  already_finalized: 'This has already been finalized and can no longer be edited.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * レッスンスプリントを始める時にコーチが選べるスプリントの教材の一覧を取得する
 * （生徒の顧客に公開されている教材だけ）
 */
export async function getAvailableSprintContents(studentId: string): Promise<LessonSprintContentSummary[]> {
  const result = await getAvailableSprintContentsCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_lesson_sprint_contents_failed', result.errorCode, ctx);
    return [];
  }
  return result.contents;
}

/**
 * 教材・種別・レベルを指定して、スプリントの問題を抜き出して取得する
 */
export async function getLessonSprintQuestions(
  contentId: string,
  questionType: SprintQuestionType,
  difficultyLevel: number,
): Promise<ActionResult<{ questions: SprintQuestion[] }>> {
  const result = await getLessonSprintQuestionsCore(contentId, questionType, difficultyLevel);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_lesson_sprint_questions_failed', result.errorCode, ctx);
    return { success: false, message: LESSON_SPRINT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, questions: result.questions };
}

/**
 * 終わったレッスンスプリントの結果を保存する
 */
export async function createLessonSprintResult(
  input: CreateLessonSprintResultInput,
): Promise<ActionResult<{ lessonSprintId: string }>> {
  const result = await createLessonSprintResultCore(input);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:create_lesson_sprint_result_failed', result.errorCode, ctx);
    return { success: false, message: LESSON_SPRINT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, lessonSprintId: result.lesson_sprint_id };
}

/**
 * このコーチとその生徒のレッスンスプリントの履歴を取得する
 */
export async function getLessonSprintHistory(studentId: string): Promise<LessonSprintHistoryListItem[]> {
  const result = await getLessonSprintHistoryCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_lesson_sprint_history_failed', result.errorCode, ctx);
    return [];
  }
  return result.records;
}

/**
 * このコーチとその生徒のレッスンスプリントの履歴を、新しい順に1ページ分取得する。
 * 次のページは前のページの `nextCursor` を渡して取得する。
 * `nextCursor` が null なら、次のページは無い。
 */
export async function getLessonSprintHistoryPage(
  studentId: string,
  cursor: string | null,
  limit: number,
): Promise<{ items: LessonSprintHistoryListItem[]; nextCursor: string | null }> {
  const result = await getLessonSprintHistoryPageCore(studentId, cursor, limit);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_lesson_sprint_history_page_failed', result.errorCode, ctx);
    return { items: [], nextCursor: null };
  }
  return { items: result.items, nextCursor: result.nextCursor };
}

/**
 * レッスンスプリントの結果を1件、出題した順に組み立て直した問題とともに取得する
 */
export async function getLessonSprintResult(
  lessonSprintId: string,
): Promise<ActionResult<{ record: LessonSprintRecord; questions: SprintQuestion[] }>> {
  const result = await getLessonSprintResultCore(lessonSprintId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_lesson_sprint_result_failed', result.errorCode, ctx);
    return { success: false, message: LESSON_SPRINT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, record: result.record, questions: result.questions };
}

/**
 * 終わったレッスンスプリントの結果のセッションのメモを更新する
 */
export async function updateLessonSprintSessionNote(
  lessonSprintId: string,
  sessionNote: string,
): Promise<ActionResult> {
  const trimmed = sessionNote.trim();
  const result = await updateLessonSprintSessionNoteCore(lessonSprintId, trimmed.length > 0 ? trimmed : null);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:update_lesson_sprint_session_note_failed', result.errorCode, ctx);
    return { success: false, message: LESSON_SPRINT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true };
}
