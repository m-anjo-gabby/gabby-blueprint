import { convertWeeklyTimeZone } from '@gabby/lib/date/date';
import type { DayOfWeek } from '@gabby/types/coachAvailability';
import { DAY_OF_WEEK_SHORT_LABEL_EN } from '@/constants/availability';

/**
 * Formats a weekly lesson slot (e.g. a lesson schedule stored in the student's timezone) as "Mon 05:00"
 * in the coach's timezone, using the offset of the next occurrence.
 */
export function formatWeeklySlotEn(
  slot: { day_of_week: number; start_time: string },
  sourceTimeZone: string,
  viewerTimeZone: string
): string {
  const converted = convertWeeklyTimeZone(
    { day_of_week: slot.day_of_week, start_time: slot.start_time, end_time: slot.start_time },
    sourceTimeZone,
    viewerTimeZone
  );
  return `${DAY_OF_WEEK_SHORT_LABEL_EN[converted.day_of_week as DayOfWeek]} ${converted.start_time}`;
}
