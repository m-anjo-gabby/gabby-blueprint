/**
 * 固定フィクスチャ（testing/FIXTURES.md）の「ターム」（契約期間）計算。
 * 2026-06-01(JST)を起点とする3か月単位で、日付は絶対値（何度計算しても同じ期間を指す）。
 * DBにはJST 00:00 / 23:59:59.999 をUTCに直して保存する（管理画面のライセンス登録と同じ形式）。
 */
const TERM_ANCHOR = { year: 2026, month: 6 };
export const TERM_MONTHS = 3;
const JST_OFFSET_MS = 9 * 3600 * 1000;

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

export interface Term {
  index: number;
  label: string;
  startIso: string;
  endIso: string;
  months: YearMonth[];
}

function jstMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
}

function addMonths(ym: YearMonth, n: number): YearMonth {
  const i = ym.month - 1 + n;
  return { year: ym.year + Math.floor(i / 12), month: ((i % 12) + 12) % 12 + 1 };
}

export function termOf(index: number): Term {
  const first = addMonths(TERM_ANCHOR, index * TERM_MONTHS);
  const next = addMonths(first, TERM_MONTHS);
  const start = jstMidnightUtc(first.year, first.month, 1);
  const end = new Date(jstMidnightUtc(next.year, next.month, 1).getTime() - 1);
  const endJst = new Date(end.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
  const months = Array.from({ length: TERM_MONTHS }, (_, i) => addMonths(first, i));
  const label = `T${index}（${first.year}-${String(first.month).padStart(2, "0")}-01〜${endJst}）`;
  return { index, label, startIso: start.toISOString(), endIso: end.toISOString(), months };
}

export function currentTermIndex(now: Date = new Date()): number {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const monthsSinceAnchor = (jst.getUTCFullYear() - TERM_ANCHOR.year) * 12 + jst.getUTCMonth() - (TERM_ANCHOR.month - 1);
  return Math.floor(monthsSinceAnchor / TERM_MONTHS);
}

/** 生徒モニタリング画面と同じ形式の対象期間（暦月の初日・末日、'YYYY-MM-DD'）。 */
export function monthRange(ym: YearMonth): { start: string; end: string } {
  const start = new Date(Date.UTC(ym.year, ym.month - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(ym.year, ym.month, 0)).toISOString().slice(0, 10);
  return { start, end };
}
