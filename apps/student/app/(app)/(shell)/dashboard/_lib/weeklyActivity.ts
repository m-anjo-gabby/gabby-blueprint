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

/** トレーニング実績の1件（実施日時と、その実績に含まれる件数） */
export interface TrainingActivity {
  /** 日付文字列（利用者のローカル日付）またはタイムスタンプ */
  date: string;
  phrases: number;
  assessments: number;
}

/** トレーニング実績（月次）から、実施日時と件数の一覧を作る */
export function collectActivities(performances: UserTrainingPerformanceResponse[]): TrainingActivity[] {
  // RPCの戻り値で配列が欠ける場合があるため（実績画面と同様に）空配列で補う
  return performances.flatMap((p) => [
    ...(p?.words ?? []).map((w) => ({ date: w.training_date, phrases: w.phrase_count, assessments: w.assessment_count })),
    ...(p?.sprint_sessions ?? [])
      .filter((s) => Boolean(s.insert_date))
      .map((s) => ({ date: s.insert_date, phrases: 0, assessments: s.assessment_count || 0 })),
    ...(p?.sprint_drills ?? []).map((d) => ({ date: d.training_date, phrases: 0, assessments: d.assessment_count })),
  ]);
}

export interface WeekDay {
  isoDate: string;
  label: string;
  isToday: boolean;
  isFuture: boolean;
  isActive: boolean;
}

const toLocalIsoDate = (date: string, timeZone: string): string =>
  DATE_ONLY_PATTERN.test(date) ? date : toIsoDateInZone(date, timeZone);

/** 利用者のタイムゾーンでの今週(月〜日)の各日と、実施日数・今週の発話回数を算出する */
export function buildCurrentWeek(activities: TrainingActivity[], timeZone: string, nowMs: number) {
  const localActivities = activities.map((a) => ({ ...a, isoDate: toLocalIsoDate(a.date, timeZone) }));
  const activeDates = new Set(localActivities.map((a) => a.isoDate));

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

  const weekStart = days[0].isoDate;
  const weekEnd = days[days.length - 1].isoDate;
  const assessmentCount = localActivities
    .filter((a) => a.isoDate >= weekStart && a.isoDate <= weekEnd)
    .reduce((sum, a) => sum + a.assessments, 0);

  return { days, activeCount: days.filter((d) => d.isActive).length, assessmentCount };
}

/**
 * 表示用の連続日数を返す。
 * DBの連続日数はトレーニング実施時にしか更新されないため、最終実施日が昨日より前（=途切れている）なら 0 とする。
 * 今日まだ実施していなくても、昨日まで続いていれば継続中として扱う。
 */
export function resolveStreakDays(
  stats: { current_streak_days: number; last_training_date: string | null } | null,
  timeZone: string,
  nowMs: number
): number {
  if (!stats?.last_training_date) return 0;
  const todayIso = toIsoDateInZone(nowMs, timeZone);
  const yesterdayIso = new Date(Date.parse(`${todayIso}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  return stats.last_training_date >= yesterdayIso ? stats.current_streak_days : 0;
}
