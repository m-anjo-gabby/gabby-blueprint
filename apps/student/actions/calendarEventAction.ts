'use server';

import { getPublishedCalendarEventsCore } from '@gabby/lib/calendarEvent/actions/calendarEventActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { CalendarEventItem } from '@gabby/types/calendarEvent';

const logger = createLogger('student');

/**
 * ログイン中の生徒向けに公開中のカレンダーイベント一覧を取得する（カレンダー画面用）
 * 読み取り専用（グループセッションの参加登録・キャンセル等は対象外）
 */
export async function getMyCalendarEvents(startIso: string, endIso: string): Promise<CalendarEventItem[]> {
  const result = await getPublishedCalendarEventsCore(startIso, endIso);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_my_calendar_events_failed', result.errorCode, ctx);
    return [];
  }
  return result.events;
}
