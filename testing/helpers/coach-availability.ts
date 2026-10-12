/**
 * コーチの空き時間（com_m_coach_availability）の投入用。空き時間は UTC の曜日・時刻で持つため、
 * 現地時刻で書いた週次の時間帯を、投入時点のコーチのタイムゾーンの時差で UTC に換算する
 * （コーチの画面と同じ換算。UTC で日をまたぐ時間帯は日ごとの2行に分ける。日の終わりは 24:00:00）。
 */
import { getUtcOffsetMinutes, shiftWeeklyMinute } from "@gabby/lib/date/date";

export interface LocalWeeklyRange {
  days: number[];
  start: string; // "HH:MM:SS"（現地時刻）
  end: string;
}

export interface AvailabilityRow {
  coach_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

const DAY_MINUTES = 24 * 60;
const toMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

export function toUtcAvailabilityRows(coachId: string, ranges: LocalWeeklyRange[], timeZone: string): AvailabilityRow[] {
  const offset = getUtcOffsetMinutes(timeZone);
  const rows: AvailabilityRow[] = [];
  for (const range of ranges) {
    const duration = toMinutes(range.end) - toMinutes(range.start);
    for (const day of range.days) {
      const start = shiftWeeklyMinute(day, toMinutes(range.start), -offset);
      const end = start.minute_of_day + duration;
      rows.push({ coach_id: coachId, day_of_week: start.day_of_week, start_time: toTime(start.minute_of_day), end_time: toTime(Math.min(end, DAY_MINUTES)) });
      if (end > DAY_MINUTES) {
        rows.push({ coach_id: coachId, day_of_week: (start.day_of_week + 1) % 7, start_time: "00:00:00", end_time: toTime(end - DAY_MINUTES) });
      }
    }
  }
  return rows;
}
