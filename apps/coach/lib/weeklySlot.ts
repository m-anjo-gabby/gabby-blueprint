import { convertWeeklyTimeZone } from '@gabby/lib/date/date';
import type { DayOfWeek } from '@gabby/types/coachAvailability';
import { DAY_OF_WEEK_SHORT_LABEL_EN } from '@/constants/availability';

/**
 * 毎週のレッスンの枠（生徒のタイムゾーンで保存したレッスンの予定等）を、次の回の UTC からのずれを使って
 * コーチのタイムゾーンで "Mon 05:00" の形にする。
 */
export function formatWeeklySlotEn(
  slot: { day_of_week: number; start_time: string },
  sourceTimeZone: string,
  viewerTimeZone: string,
): string {
  const converted = convertWeeklyTimeZone(
    { day_of_week: slot.day_of_week, start_time: slot.start_time, end_time: slot.start_time },
    sourceTimeZone,
    viewerTimeZone,
  );
  return `${DAY_OF_WEEK_SHORT_LABEL_EN[converted.day_of_week as DayOfWeek]} ${converted.start_time}`;
}
