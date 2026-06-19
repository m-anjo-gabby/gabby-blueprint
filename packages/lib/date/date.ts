/**
 * 入力用（JSTの日付文字列をUTCのISO形式に変換）
 * 契約・ライセンスの開始/終了日時の境界値を正確に生成
 */
export const getUtcRangeFromJstDate = (startDateStr: string, endDateStr: string) => {
  if (!startDateStr || !endDateStr || isNaN(Date.parse(startDateStr)) || isNaN(Date.parse(endDateStr))) {
    throw new Error(`Invalid date provided: start=${startDateStr}, end=${endDateStr}`);
  }

  return {
    // JSTの00:00:00をUTCに変換
    startUtc: new Date(`${startDateStr}T00:00:00+09:00`).toISOString(),
    // JSTの23:59:59をUTCに変換
    endUtc: new Date(`${endDateStr}T23:59:59.999+09:00`).toISOString(),
  };
};

/**
 * 汎用的な日付フォーマッター
 * @param dateString UTCの日時文字列
 * @param timeZone 表示したいタイムゾーン（デフォルトは Asia/Tokyo）
 */
export const formatDateByZone = (
  dateString?: string | null, 
  timeZone: string = 'Asia/Tokyo'
): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timeZone,
    }).format(date).replace(/\//g, '-');
  } catch (e) {
    // 不正なタイムゾーンが渡された場合のフォールバック
    console.error("Invalid timezone:", timeZone);
    return formatDateByZone(dateString, 'Asia/Tokyo');
  }
};

/**
 * 汎用的な日時フォーマッター
 */
export const formatDateTimeByZone = (
  dateString?: string | null,
  timeZone: string = 'Asia/Tokyo'
): string => {
  if (!dateString) return "---";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "---";

  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit', // 必要に応じて
      timeZone: timeZone,
    }).format(date);
  } catch (e) {
    return formatDateTimeByZone(dateString, 'Asia/Tokyo');
  }
};

// 特定フォーマットのエイリアス
export const formatToJstDate = (d?: string | null) => formatDateByZone(d, 'Asia/Tokyo');
export const formatToJstDateTime = (d?: string | null) => formatDateTimeByZone(d, 'Asia/Tokyo');

/**
 * 指定されたタイムゾーンに基づき、日付を ISO 形式 (YYYY-MM-DD) で取得します。
 */
export const toIsoDateInZone = (date: Date | string | number, timeZone: string): string => {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

/**
 * 指定されたタイムゾーンに基づき、年月を (YYYY-MM) 形式で取得します。
 */
export const toIsoMonthInZone = (date: Date | string | number, timeZone: string): string => {
  return toIsoDateInZone(date, timeZone).slice(0, 7);
};

/**
 * 表示用の日付フォーマッター (YYYY/MM/DD)
 */
export const formatZonedDate = (date: Date | string | number | null | undefined, timeZone: string): string => {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(d);
};