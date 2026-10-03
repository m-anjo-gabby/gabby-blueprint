import { toIsoMonthInZone, zonedWallClockToUtc } from './date';

/**
 * 集計期間を区切るタイムゾーン（モニターの対象月・期間、対象生徒の判定、トレーニングレポートの満了月・契約期間）。
 * 顧客は国内企業で、契約期間も日本時間の日付で作っているため日本時間。各実績の日付は生徒のタイムゾーンでの実施日で数える
 * （testing/e2e/specs/training/training-stats.md）。
 * 日本時間以外で区切る必要が出たら、ここ（とDB側の public.reporting_timezone()）を顧客ごとの設定に置き換える。
 */
export const REPORTING_TIMEZONE = 'Asia/Tokyo';

/** 集計期間のタイムゾーンでの今月（YYYY-MM） */
export const currentReportingMonth = (now: Date = new Date()): string => toIsoMonthInZone(now, REPORTING_TIMEZONE);

/** 集計期間のタイムゾーンでの月（YYYY-MM）の範囲を、絶対時刻（ISO）の [from, to) で返す */
export function reportingMonthRange(yearMonth: string): { from: string; to: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  const nextYearMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    from: zonedWallClockToUtc(`${yearMonth}-01T00:00:00`, REPORTING_TIMEZONE).toISOString(),
    to: zonedWallClockToUtc(`${nextYearMonth}-01T00:00:00`, REPORTING_TIMEZONE).toISOString(),
  };
}
