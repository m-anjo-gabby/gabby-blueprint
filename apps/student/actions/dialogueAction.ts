"use server";

import { getMyDialogueAssignmentsCore } from "@gabby/lib/coachStudent/actions/dialogueActions";
import { DialogueAssignmentSummary } from "@gabby/types/dialogue";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";

const logger = createLogger('student');

// 自身に割り当てられているダイアログ教材セットを取得（セッション別の進捗を含む）
export async function getMyDialogueAssignments(): Promise<DialogueAssignmentSummary[]> {
  const ctx = await getLogContext();
  const result = await getMyDialogueAssignmentsCore();
  if (!result.success) {
    logger.error("dialogue:get_my_assignments_failed", result.errorCode, ctx);
    return [];
  }
  return result.assignments;
}
