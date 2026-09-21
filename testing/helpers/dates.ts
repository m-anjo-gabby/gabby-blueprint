const DAY_MS = 24 * 60 * 60 * 1000;

/** 指定日(UTC暦日として扱う)を基準に、直近の過去のdow(0=日..6=土)の日付を返す（当日は含めない）。 */
export function latestPastDow(base: Date, dow: number): Date {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  let diff = (d.getUTCDay() - dow + 7) % 7;
  if (diff === 0) diff = 7;
  return new Date(d.getTime() - diff * DAY_MS);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** 暦日(UTC基準のDate)とJSTの時刻(hh:mm)から、timestamptz用のISO文字列を作る。 */
export function jstDateTimeISO(dateOnly: Date, hh: number, mm: number): string {
  return new Date(
    Date.UTC(dateOnly.getUTCFullYear(), dateOnly.getUTCMonth(), dateOnly.getUTCDate(), hh - 9, mm)
  ).toISOString();
}

export function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
