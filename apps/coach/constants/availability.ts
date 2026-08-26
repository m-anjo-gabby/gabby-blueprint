import { DayOfWeek } from '@gabby/types/coachAvailability';

/** English day-of-week labels for the Coach portal (0:Sun ... 6:Sat, matching com_m_coach_availability.day_of_week). */
export const DAY_OF_WEEK_LABEL_EN: Record<DayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const DAY_OF_WEEK_SHORT_LABEL_EN: Record<DayOfWeek, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};
