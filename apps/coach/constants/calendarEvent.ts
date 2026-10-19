import { type CalendarEventType } from '@gabby/types/calendarEvent';

/** コーチのポータルの英語のイベントの種別のラベル（色・badgeClass は共通の CALENDAR_EVENT_TYPES のまま）。 */
export const CALENDAR_EVENT_TYPE_LABEL_EN: Record<CalendarEventType, string> = {
  GROUP_SESSION: 'Group Session',
  MAINTENANCE: 'Maintenance',
};
