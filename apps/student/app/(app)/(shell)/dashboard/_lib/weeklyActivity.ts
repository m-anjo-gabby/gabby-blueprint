import { toIsoDateInZone } from '@gabby/lib/date/date';
import type { UserTrainingPerformanceResponse } from '@/actions/performanceAction';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 「今週」(利用者のタイムゾーンでの月〜日) を確実に含む年月(YYYY-MM)の一覧を返す。
 * サーバー側では利用者のタイムゾーンを持たないため、全タイムゾーンの今週を覆う
 * [now-8日, now+1日] の範囲に掛かる月をUTC基準で列挙する（最大2か月）。
 */
export function getMonthKeysCoveringThisWeek(nowMs: number): string[] {
  const months = [nowMs - 8 * DAY_MS, nowMs, nowMs + DAY_MS].map((ms) => new Date(ms).toISOString().slice(0, 7));
  return Array.from(new Set(months));
}

/** トレーニング実績から、学習した日時（日付文字列またはタイムスタンプ）を抽出する */
export function collectActivityDates(performances: UserTrainingPerformanceResponse[]): string[] {
  // RPCの戻り値で配列が欠ける場合があるため（実績画面と同様に）空配列で補う
  return performances.flatMap((p) => [
    ...(p?.words ?? []).map((w) => w.training_date),
    ...(p?.sprint_sessions ?? []).map((s) => s.insert_date).filter(Boolean),
    ...(p?.sprint_drills ?? []).map((d) => d.training_date),
  ]);
}

export interface WeekDay {
  isoDate: string;
  label: string;
  isToday: boolean;
  isFuture: boolean;
  isActive: boolean;
}

/** 利用者のタイムゾーンでの今週(月〜日)の各日と、学習した日数を算出する */
export function buildCurrentWeek(activityDates: string[], timeZone: string, nowMs: number) {
  const activeDates = new Set(
    activityDates.map((d) => (DATE_ONLY_PATTERN.test(d) ? d : toIsoDateInZone(d, timeZone)))
  );

  const todayIso = toIsoDateInZone(nowMs, timeZone);
  const todayUtcMs = Date.parse(`${todayIso}T00:00:00Z`);
  const mondayOffset = (new Date(todayUtcMs).getUTCDay() + 6) % 7;

  const days: WeekDay[] = WEEKDAY_LABELS.map((label, index) => {
    const isoDate = new Date(todayUtcMs + (index - mondayOffset) * DAY_MS).toISOString().slice(0, 10);
    return {
      isoDate,
      label,
      isToday: isoDate === todayIso,
      isFuture: isoDate > todayIso,
      isActive: activeDates.has(isoDate),
    };
  });

  return { days, activeCount: days.filter((d) => d.isActive).length };
}
