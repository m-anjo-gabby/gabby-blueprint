'use server';

import {
  getPublishedCalendarEventsCore,
  joinCalendarEventCore,
  cancelCalendarEventParticipationCore,
  getCalendarEventMessagesCore,
  getCalendarEventMessageAttachmentUrlCore,
} from '@gabby/lib/calendarEvent/actions/calendarEventActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { type CalendarEventItem, type CalendarEventMessageItem } from '@gabby/types/calendarEvent';
import type { ActionResult } from '@gabby/types/action';

const logger = createLogger('coach');

const CALENDAR_EVENT_ERROR_MESSAGE = 'Something went wrong. Please try again in a moment.';

/**
 * ログイン中のコーチのカレンダーに出す、公開中のイベント（グループセッション・メンテナンスのお知らせ等）を取得する。
 */
export async function getMyCalendarEvents(startIso: string, endIso: string): Promise<CalendarEventItem[]> {
  const result = await getPublishedCalendarEventsCore(startIso, endIso);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_my_calendar_events_failed', result.errorCode, ctx);
    return [];
  }
  return result.events;
}

/**
 * 参加の受付があるイベント（グループセッション等）に参加する。
 */
export async function joinCalendarEvent(calendarEventId: string): Promise<ActionResult> {
  const result = await joinCalendarEventCore(calendarEventId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:join_calendar_event_failed', result.errorCode, ctx);
    return { success: false, message: CALENDAR_EVENT_ERROR_MESSAGE };
  }
  return { success: true };
}

/**
 * イベントへの参加を取り消す。
 */
export async function cancelCalendarEventParticipation(calendarEventId: string): Promise<ActionResult> {
  const result = await cancelCalendarEventParticipationCore(calendarEventId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:cancel_calendar_event_participation_failed', result.errorCode, ctx);
    return { success: false, message: CALENDAR_EVENT_ERROR_MESSAGE };
  }
  return { success: true };
}

/**
 * コーチが参加者・担当者になっているイベントの連絡を取得する。
 */
export async function getCalendarEventMessages(calendarEventId: string): Promise<CalendarEventMessageItem[]> {
  const result = await getCalendarEventMessagesCore(calendarEventId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_calendar_event_messages_failed', result.errorCode, ctx);
    return [];
  }
  return result.messages;
}

/**
 * 連絡の添付ファイルの公開 URL を取得する。
 */
export async function getCalendarEventMessageAttachmentUrl(path: string): Promise<{ url: string | null }> {
  return getCalendarEventMessageAttachmentUrlCore(path);
}
