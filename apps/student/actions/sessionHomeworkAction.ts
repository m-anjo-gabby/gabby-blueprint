'use server';

import { getSessionHomeworkCore } from '@gabby/lib/sessionHomework/actions/sessionHomeworkActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { SessionHomeworkEntry } from '@gabby/types/sessionHomework';

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
