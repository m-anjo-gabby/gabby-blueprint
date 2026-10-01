/**
 * タイムゾーン設定と端末（ブラウザ）のタイムゾーンのずれ判定。
 * ホームの日付行で、設定の誤りに気づけるようにするために使う。
 */

/** 端末のIANAタイムゾーン名（取得できない環境では null） */
export const getDeviceTimezone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

const LOCAL_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};

/**
 * 2つのタイムゾーンで現在時刻の表示が異なるかを判定する。
 * 名前が違っても時刻が同じ（例: Asia/Tokyo と Asia/Seoul）なら表示に影響しないため、ずれとみなさない。
 */
export const hasTimezoneMismatch = (settingZone: string, deviceZone: string, nowMs: number): boolean => {
  if (settingZone === deviceZone) return false;
  try {
    const now = new Date(nowMs);
    const format = (timeZone: string) => new Intl.DateTimeFormat('en-US', { ...LOCAL_TIME_FORMAT, timeZone }).format(now);
    return format(settingZone) !== format(deviceZone);
  } catch {
    // 未知のタイムゾーン名などで判定できない場合は、誤警告を避けて表示しない
    return false;
  }
};

/**
 * 指定時点のUTCからの時差（例: UTC+9:00、UTC−4:00、UTC±0:00）。
 * 端末のタイムゾーンはマスタに無い地域もあり得るため、名称ではなくこの固定表記で示す。取得できない場合は null。
 */
export const formatUtcOffset = (timeZone: string, nowMs: number): string | null => {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(nowMs))
      .find((p) => p.type === 'timeZoneName')?.value;
    if (!name) return null;
    // "GMT+09:00" / "GMT-04:00" / "GMT"（時差なし）の形式で返る
    const match = /^GMT(?:([+-])(\d{1,2}):?(\d{2}))?$/.exec(name);
    if (!match) return null;
    const [, sign, hours, minutes] = match;
    if (!sign || (Number(hours) === 0 && minutes === '00')) return 'UTC±0:00';
    return `UTC${sign === '-' ? '−' : '+'}${Number(hours)}:${minutes}`;
  } catch {
    return null;
  }
};

/** 指定タイムゾーンでの日時（例: 9/26 21:00） */
export const formatTimeInZone = (nowMs: number, timeZone: string): string =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(nowMs));
