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
  type DialogueAssignmentSummary,
  type DialogueContentSummary,
  type UpdateDialogueSessionProgressInput,
  type LogSessionDialogueOpenInput,
} from '@gabby/types/dialogue';
import { type CoachStudentErrorCode } from '@gabby/types/coachStudent';
import type { ActionResult } from '@gabby/types/action';

const logger = createLogger('coach');

const DIALOGUE_ERROR_MESSAGES_EN: Record<CoachStudentErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have access to this student.',
  invalid_input: 'Please check your input and try again.',
  already_finalized: 'This has already been finalized and can no longer be edited.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * コーチがその生徒に割り当てられるダイアログ練習のセットの一覧を取得する
 * （生徒の顧客に公開されているセットだけ）
 */
export async function getAvailableDialogueContents(studentId: string): Promise<DialogueContentSummary[]> {
  const result = await getAvailableDialogueContentsCore(studentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_dialogue_contents_failed', result.errorCode, ctx);
    return [];
  }
  return result.contents;
}

/**
 * ダイアログ練習のセットを生徒に割り当てる
 */
export async function assignDialogueContent(
  studentId: string,
  contentId: string,
): Promise<ActionResult<{ assignmentId: string }>> {
  const result = await assignDialogueContentCore(studentId, contentId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:assign_dialogue_content_failed', result.errorCode, ctx);
    return { success: false, message: DIALOGUE_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true, assignmentId: result.assignment_id };
}

/**
 * 割り当てたダイアログ練習のセットを外す
 */
export async function unassignDialogueContent(assignmentId: string): Promise<ActionResult> {
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
 * 生徒に割り当てたダイアログ練習のセットを、セッションごとの進み具合とともに取得する
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
 * ダイアログ練習のセッションの完了の状態とコーチのメモを更新する
 */
export async function updateDialogueSessionProgress(input: UpdateDialogueSessionProgressInput): Promise<ActionResult> {
  const result = await updateDialogueSessionProgressCore(input);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:update_dialogue_session_progress_failed', result.errorCode, ctx);
    return { success: false, message: DIALOGUE_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true };
}

/**
 * ライブセッション中にコーチがダイアログ練習の教材のリンクを開いたことを記録する。
 * 記録は残せたら残す程度で、呼び出し側は教材のリンクを開くのをこれで止めない。
 */
export async function logSessionDialogueOpen(input: LogSessionDialogueOpenInput): Promise<ActionResult> {
  const result = await logSessionDialogueOpenCore(input);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:log_session_dialogue_open_failed', result.errorCode, ctx);
    return { success: false, message: DIALOGUE_ERROR_MESSAGES_EN[result.errorCode] };
  }
  return { success: true };
}
