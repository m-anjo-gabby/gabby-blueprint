'use server';

import {
  getAvailableDialogueContentsCore,
  assignDialogueContentCore,
  unassignDialogueContentCore,
  getStudentDialogueAssignmentsCore,
  updateDialogueSessionProgressCore,
  logSessionDialogueOpenCore,
} from '@gabby/lib/coachStudent/actions/dialogueActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  DialogueAssignmentSummary,
  DialogueContentSummary,
  UpdateDialogueSessionProgressInput,
  LogSessionDialogueOpenInput,
} from '@gabby/types/dialogue';
import { CoachStudentErrorCode } from '@gabby/types/coachStudent';

const logger = createLogger('coach');

const DIALOGUE_ERROR_MESSAGES_EN: Record<CoachStudentErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have access to this student.',
  invalid_input: 'Please check your input and try again.',
  already_finalized: 'This has already been finalized and can no longer be edited.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * Fetches the list of Dialogue Practice sets a coach can pick from when assigning to a student
 */
export async function getAvailableDialogueContents(): Promise<DialogueContentSummary[]> {
  const result = await getAvailableDialogueContentsCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_dialogue_contents_failed', result.errorCode, ctx);
    return [];
  }
  return result.contents;
}

/**
 * Assigns a Dialogue Practice set to a student
 */
export async function assignDialogueContent(
  studentId: string,
  contentId: string
): Promise<{ success: true; assignmentId: string } | { success: false; message: string }> {
  const result = await assignDialogueContentCore(studentId, contentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:assign_dialogue_content_failed', result.errorCode, ctx);
    return { success: false, message: DIALOGUE_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, assignmentId: result.assignment_id };
}

/**
 * Unassigns a previously assigned Dialogue Practice set
 */
export async function unassignDialogueContent(
  assignmentId: string
): Promise<{ success: true } | { success: false; message: string }> {
  const result = await unassignDialogueContentCore(assignmentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:unassign_dialogue_content_failed', result.errorCode, ctx);
    if (result.errorCode === 'invalid_input') {
      return { success: false, message: 'This set already has completed sessions and cannot be unassigned.' };
    }
    return { success: false, message: DIALOGUE_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true };
}

/**
 * Fetches a student's assigned Dialogue Practice sets, with per-session progress
 */
export async function getStudentDialogueAssignments(studentId: string): Promise<DialogueAssignmentSummary[]> {
  const result = await getStudentDialogueAssignmentsCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_student_dialogue_assignments_failed', result.errorCode, ctx);
    return [];
  }
  return result.assignments;
}

/**
 * Updates a Dialogue Practice session's completion state and coach notes
 */
export async function updateDialogueSessionProgress(
  input: UpdateDialogueSessionProgressInput
): Promise<{ success: true } | { success: false; message: string }> {
  const result = await updateDialogueSessionProgressCore(input);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:update_dialogue_session_progress_failed', result.errorCode, ctx);
    return { success: false, message: DIALOGUE_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true };
}

/**
 * Records that a coach opened a Dialogue Practice material's slide link during a live session.
 * Best-effort logging only — callers should not block the slide link on this.
 */
export async function logSessionDialogueOpen(
  input: LogSessionDialogueOpenInput
): Promise<{ success: true } | { success: false; message: string }> {
  const result = await logSessionDialogueOpenCore(input);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:log_session_dialogue_open_failed', result.errorCode, ctx);
    return { success: false, message: DIALOGUE_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true };
}
