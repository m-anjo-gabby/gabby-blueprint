const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 月表示のカレンダー（前後の週を含むグリッド）を確実に覆う取得範囲（ISO文字列）。
 * 日付への振り分けは画面側が利用者のタイムゾーンで行うため、どのタイムゾーンでも欠けないよう前後に余裕を持たせる。
 * coach / student のカレンダーで共有する。
 *
 * @param month 表示する月（YYYY-MM）
 */
export function getMonthGridRange(month: string): { startIso: string; endIso: string } {
  const [year, monthNo] = month.split('-').map(Number);
  const start = Date.UTC(year, monthNo - 1, 1) - 8 * DAY_MS;
  const end = Date.UTC(year, monthNo, 1) + 8 * DAY_MS;
  return { startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() };
}

/** URL の ?month= の形式（YYYY-MM）か */
export const isMonthParam = (value: string | undefined | null): value is string =>
  !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
