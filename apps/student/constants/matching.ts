import { DayOfWeek } from '@gabby/types/coachAvailability';

/** 専属コーチマッチング機能の曜日ラベル（0:日 ... 6:土、com_m_coach_availability.day_of_weekに準拠） */
export const DAY_OF_WEEK_LABEL_JA: Record<DayOfWeek, string> = {
  0: '日曜日',
  1: '月曜日',
  2: '火曜日',
  3: '水曜日',
  4: '木曜日',
  5: '金曜日',
  6: '土曜日',
};
