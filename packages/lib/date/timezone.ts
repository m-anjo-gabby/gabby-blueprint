/*
 * タイムゾーンの表示（全アプリ・メール共通）。
 * 名称はマスタ（com_m_timezone の display_name_* / short_name_*）を使い、Intl の地域名は使わない
 * （実行環境の ICU によって名称が変わり、地域を区別できない名称もあるため）。
 * 時差は夏時間で変わるため保存せず、ここで表示する時点ごとに求める。
 */

/**
 * 指定時点の UTC からの時差（例: UTC+9、UTC−4、UTC+5:30、UTC±0）。
 * 未知のタイムゾーン名などで求められない場合は null。
 */
export function formatUtcOffset(timeZone: string, at: Date | number = new Date()): string | null {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (!name) return null;
    // "GMT+09:00" / "GMT-04:00" / "GMT"（時差なし）の形式で返る
    const match = /^GMT(?:([+-])(\d{1,2}):?(\d{2}))?$/.exec(name);
    if (!match) return null;
    const [, sign, hours, minutes] = match;
    if (!sign || (Number(hours) === 0 && minutes === '00')) return 'UTC±0';
    return `UTC${sign === '-' ? '−' : '+'}${Number(hours)}${minutes === '00' ? '' : `:${minutes}`}`;
  } catch {
    return null;
  }
}

/**
 * 日時に添えるタイムゾーンの表記（短い名前＋その時点の時差）。
 * 例: ja「日本時間・UTC+9」/ en「US Eastern Time, UTC−4」。名前が無い場合は時差だけ、時差も求められない場合は IANA 名。
 */
export function formatZoneLabel({
  timeZone,
  name,
  at,
  language,
}: {
  timeZone: string;
  /** マスタの短い名前（short_name_ja / short_name_en） */
  name: string | null | undefined;
  at: Date | number;
  language: 'ja' | 'en';
}): string {
  const offset = formatUtcOffset(timeZone, at);
  if (!offset) return name || timeZone;
  if (!name) return offset;
  return language === 'ja' ? `${name}・${offset}` : `${name}, ${offset}`;
}
