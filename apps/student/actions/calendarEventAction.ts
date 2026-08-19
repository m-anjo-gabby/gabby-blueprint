'use server';

import {
  getPublishedCalendarEventsCore,
  joinCalendarEventCore,
  cancelCalendarEventParticipationCore,
} from '@gabby/lib/calendarEvent/actions/calendarEventActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { CalendarEventItem } from '@gabby/types/calendarEvent';

const logger = createLogger('student');

const CALENDAR_EVENT_ERROR_MESSAGE = '予期しないエラーが発生しました。時間を置いて再度お試しください。';

/**
 * ログイン中の生徒向けに公開中のカレンダーイベント一覧を取得する（カレンダー画面用）
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

/**
 * グループセッション等（rsvp_enabled=TRUE）のカレンダーイベントに参加登録する
 */
export async function joinCalendarEvent(calendarEventId: string): Promise<{ success: true } | { success: false; message: string }> {
  const result = await joinCalendarEventCore(calendarEventId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:join_calendar_event_failed', result.errorCode, ctx);
    return { success: false, message: CALENDAR_EVENT_ERROR_MESSAGE };
  }
  return { success: true };
}

/**
 * カレンダーイベントの参加をキャンセルする
 */
export async function cancelCalendarEventParticipation(
  calendarEventId: string
): Promise<{ success: true } | { success: false; message: string }> {
  const result = await cancelCalendarEventParticipationCore(calendarEventId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:cancel_calendar_event_participation_failed', result.errorCode, ctx);
    return { success: false, message: CALENDAR_EVENT_ERROR_MESSAGE };
  }
  return { success: true };
}
