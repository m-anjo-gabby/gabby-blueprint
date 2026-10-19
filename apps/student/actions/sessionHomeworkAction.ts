'use server';

import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  getSessionHomeworkCore,
  markSessionHomeworkViewedCore,
} from '@gabby/lib/sessionHomework/actions/sessionHomeworkActions';
import { type SessionHomeworkEntry } from '@gabby/types/sessionHomework';

const logger = createLogger('student');

/**
 * 対象セッションの宿題本体（フォローアップコメント含む）を取得する（生徒本人向け、閲覧のみ。
 * 投稿はコーチのみのため本アプリには持たない）。未投稿の場合はnullを返す。
 */
export async function getSessionHomework(sessionId: string): Promise<SessionHomeworkEntry | null> {
  const result = await getSessionHomeworkCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_session_homework_failed', result.errorCode, ctx);
    return null;
  }
  return result.homework;
}

/**
 * 生徒が宿題を開いたことを記録する（コーチの画面の「見たか・最新の追記を見たか」に使う）。
 * セッション結果画面をサーバーで描く時に呼ぶ。失敗しても画面の表示は止めない。
 */
export async function markSessionHomeworkViewed(sessionId: string): Promise<void> {
  await markSessionHomeworkViewedCore(sessionId);
}
