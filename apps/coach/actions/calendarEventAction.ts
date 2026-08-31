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
import { CalendarEventItem, CalendarEventMessageItem } from '@gabby/types/calendarEvent';

const logger = createLogger('coach');

const CALENDAR_EVENT_ERROR_MESSAGE = 'Something went wrong. Please try again in a moment.';

/**
 * Get published calendar events (group sessions, maintenance notices, etc.) for the logged-in coach's calendar.
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
 * Join a calendar event (e.g. a group session) that has RSVP enabled.
 */
export async function joinCalendarEvent(calendarEventId: string): Promise<{ success: true } | { success: false; message: string }> {
  const result = await joinCalendarEventCore(calendarEventId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:join_calendar_event_failed', result.errorCode, ctx);
    return { success: false, message: CALENDAR_EVENT_ERROR_MESSAGE };
  }
  return { success: true };
}

/**
 * Cancel participation in a calendar event.
 */
export async function cancelCalendarEventParticipation(
  calendarEventId: string
): Promise<{ success: true } | { success: false; message: string }> {
  const result = await cancelCalendarEventParticipationCore(calendarEventId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:cancel_calendar_event_participation_failed', result.errorCode, ctx);
    return { success: false, message: CALENDAR_EVENT_ERROR_MESSAGE };
  }
  return { success: true };
}

/**
 * Get announcements for a calendar event the coach is a participant of, or assigned to.
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
 * Get the public URL for an announcement attachment.
 */
export async function getCalendarEventMessageAttachmentUrl(path: string): Promise<{ url: string | null }> {
  return getCalendarEventMessageAttachmentUrlCore(path);
}
