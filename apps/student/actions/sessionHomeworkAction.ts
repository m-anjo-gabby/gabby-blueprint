'use server';

import {
  getSessionHomeworkCore,
  getHomeworkChecklistCore,
  updateHomeworkChecklistItemStatusCore,
} from '@gabby/lib/sessionHomework/actions/sessionHomeworkActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { SessionHomeworkChecklistItem, SessionHomeworkEntry } from '@gabby/types/sessionHomework';

const logger = createLogger('student');

/**
 * 対象セッションの宿題一覧を取得する（生徒本人向け、閲覧のみ。投稿はコーチのみのため本アプリには持たない）
 */
export async function getSessionHomework(sessionId: string): Promise<SessionHomeworkEntry[]> {
  const result = await getSessionHomeworkCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_session_homework_failed', result.errorCode, ctx);
    return [];
  }
  return result.entries;
}

/**
 * 対象セッションの宿題チェックリストを取得する（生徒本人向け、閲覧のみ。項目の追加はコーチのみ）
 */
export async function getSessionHomeworkChecklist(sessionId: string): Promise<SessionHomeworkChecklistItem[]> {
  const result = await getHomeworkChecklistCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_session_homework_checklist_failed', result.errorCode, ctx);
    return [];
  }
  return result.items;
}

/**
 * 宿題チェックリスト項目の完了状態を更新する（生徒本人のみ、ON/OFFの切り替え）
 */
export async function updateHomeworkChecklistItemStatus(
  checklistItemId: string,
  isDone: boolean
): Promise<{ success: true; item: SessionHomeworkChecklistItem } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await updateHomeworkChecklistItemStatusCore(checklistItemId, isDone);

  if (!result.success) {
    logger.error('student:update_homework_checklist_item_failed', result.errorCode, ctx);
    return { success: false, message: 'チェックリストの更新に失敗しました。もう一度お試しください。' };
  }

  logger.info('student:update_homework_checklist_item_success', 'Checklist item updated', ctx);
  return { success: true, item: result.item };
}
