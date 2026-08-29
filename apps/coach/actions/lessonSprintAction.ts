'use server';

import {
  getAvailableSprintContentsCore,
  getLessonSprintQuestionsCore,
  createLessonSprintResultCore,
  getLessonSprintHistoryCore,
  getLessonSprintResultCore,
} from '@gabby/lib/coachStudent/actions/lessonSprintActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  CreateLessonSprintResultInput,
  LessonSprintContentSummary,
  LessonSprintHistoryListItem,
  LessonSprintRecord,
} from '@gabby/types/lessonSprint';
import { CoachStudentErrorCode } from '@gabby/types/coachStudent';
import { SprintQuestion, SprintQuestionType } from '@gabby/types/sprint';

const logger = createLogger('coach');

const LESSON_SPRINT_ERROR_MESSAGES_EN: Record<CoachStudentErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have access to this student.',
  invalid_input: 'Please check your input and try again.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * Fetches the list of sprint contents a coach can pick from when starting a Lesson Sprint
 */
export async function getAvailableSprintContents(): Promise<LessonSprintContentSummary[]> {
  const result = await getAvailableSprintContentsCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_lesson_sprint_contents_failed', result.errorCode, ctx);
    return [];
  }
  return result.contents;
}

/**
 * Fetches a sampled set of sprint questions for the given content/type/level
 */
export async function getLessonSprintQuestions(
  contentId: string,
  questionType: SprintQuestionType,
  difficultyLevel: number
): Promise<{ success: true; questions: SprintQuestion[] } | { success: false; message: string }> {
  const result = await getLessonSprintQuestionsCore(contentId, questionType, difficultyLevel);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_lesson_sprint_questions_failed', result.errorCode, ctx);
    return { success: false, message: LESSON_SPRINT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, questions: result.questions };
}

/**
 * Saves a completed Lesson Sprint session's results
 */
export async function createLessonSprintResult(
  input: CreateLessonSprintResultInput
): Promise<{ success: true; lessonSprintId: string } | { success: false; message: string }> {
  const result = await createLessonSprintResultCore(input);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:create_lesson_sprint_result_failed', result.errorCode, ctx);
    return { success: false, message: LESSON_SPRINT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, lessonSprintId: result.lesson_sprint_id };
}

/**
 * Fetches this coach's Lesson Sprint history with the given student
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
 * Fetches one Lesson Sprint result with its questions reconstructed in play order
 */
export async function getLessonSprintResult(
  lessonSprintId: string
): Promise<{ success: true; record: LessonSprintRecord; questions: SprintQuestion[] } | { success: false; message: string }> {
  const result = await getLessonSprintResultCore(lessonSprintId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_lesson_sprint_result_failed', result.errorCode, ctx);
    return { success: false, message: LESSON_SPRINT_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, record: result.record, questions: result.questions };
}
