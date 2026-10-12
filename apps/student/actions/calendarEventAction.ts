'use server';

import {
  getPublishedCalendarEventsCore,
  joinCalendarEventCore,
  cancelCalendarEventParticipationCore,
  getCalendarEventMessagesCore,
  getCalendarEventMessageAttachmentUrlCore,
  joinCalendarEventSeriesCore,
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

/** グループセッションの一覧に出す期間（これから: 今日から先の日数 / 過去: さかのぼる日数） */
const GROUP_SESSION_UPCOMING_DAYS = 120;
const GROUP_SESSION_PAST_DAYS = 183;

/**
 * グループセッションの一覧（/group-sessions）。種別の homeDisplay が feature のイベントを、
 * これから（開催前・開催中。開始順）と、参加登録した過去の回（終了済み。新しい順）に分けて返す。
 */
export async function getGroupSessionList(): Promise<{ upcoming: CalendarEventItem[]; past: CalendarEventItem[] }> {
  const nowMs = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const events = await getMyCalendarEvents(
    new Date(nowMs - GROUP_SESSION_PAST_DAYS * DAY_MS).toISOString(),
    new Date(nowMs + GROUP_SESSION_UPCOMING_DAYS * DAY_MS).toISOString()
  );
  const featured = events.filter((event) => CALENDAR_EVENT_TYPES[event.event_type]?.homeDisplay === 'feature');
  return {
    upcoming: featured.filter((event) => getCalendarEventPhase(event, nowMs) !== 'ended'),
    past: featured
      .filter((event) => event.is_joined && getCalendarEventPhase(event, nowMs) === 'ended')
      .sort((a, b) => b.start_datetime.localeCompare(a.start_datetime)),
  };
}

/**
 * シリーズのまだ終わっていない回に、まとめて参加登録する
 */
export async function joinCalendarEventSeries(
  seriesId: string
): Promise<{ success: true; joinedIds: string[] } | { success: false; message: string }> {
  const result = await joinCalendarEventSeriesCore(seriesId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:join_calendar_event_series_failed', result.errorCode, ctx);
    return { success: false, message: CALENDAR_EVENT_ERROR_MESSAGE };
  }
  return { success: true, joinedIds: result.joinedIds };
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
