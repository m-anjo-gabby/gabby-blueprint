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
import {
  CALENDAR_EVENT_TYPES,
  CalendarEventItem,
  CalendarEventMessageItem,
  getCalendarEventPhase,
} from '@gabby/types/calendarEvent';

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

/** ホームに出すイベントの期間（今日から先の日数） */
const HOME_EVENT_RANGE_DAYS = 30;

/**
 * ホームに出すカレンダーイベント（種別の homeDisplay が feature のもの）を、開催中・開催前に限って開始順に取得する。
 * 開催中のイベントも出すため、取得の起点は終了時刻を持たないイベントの既定の長さより前にする。
 */
export async function getHomeCalendarEvents(): Promise<CalendarEventItem[]> {
  const nowMs = Date.now();
  const startIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const endIso = new Date(nowMs + HOME_EVENT_RANGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const events = await getMyCalendarEvents(startIso, endIso);
  return events.filter(
    (event) =>
      CALENDAR_EVENT_TYPES[event.event_type]?.homeDisplay === 'feature' && getCalendarEventPhase(event, nowMs) !== 'ended'
  );
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

/**
 * 参加登録済み/担当コーチとして紐づくカレンダーイベントのアナウンス一覧を取得する
 */
export async function getCalendarEventMessages(calendarEventId: string): Promise<CalendarEventMessageItem[]> {
  const result = await getCalendarEventMessagesCore(calendarEventId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_calendar_event_messages_failed', result.errorCode, ctx);
    return [];
  }
  return result.messages;
}

/**
 * アナウンス添付ファイルの公開URLを取得する
 */
export async function getCalendarEventMessageAttachmentUrl(path: string): Promise<{ url: string | null }> {
  return getCalendarEventMessageAttachmentUrlCore(path);
}
