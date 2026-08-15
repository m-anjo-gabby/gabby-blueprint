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
    timeZone: timeZone || 'Asia/Tokyo',
  }).format(d);
};

/**
 * 表示用の日本語日付フォーマッター (YYYY年MM月DD日)
 */
export const formatZonedDateJapanese = (date: Date | string | number | null | undefined, timeZone: string): string => {
  const zonedStr = formatZonedDate(date, timeZone || 'Asia/Tokyo');
  if (!zonedStr) return '';
  const parts = zonedStr.split('/');
  if (parts.length !== 3) return zonedStr;
  return `${parts[0]}年${parts[1]}月${parts[2]}日`;
};

/**
 * ----------------------------------------------
 * 専属コーチマッチング機能: レッスン枠計算ユーティリティ
 * ----------------------------------------------
 * 1レッスン25分・30分単位の枠が前提（Coach Availability登録時の業務ルールに準拠）。
 * マッチングリクエスト作成・セッション振替の両画面で共通利用する。
 */
const LESSON_MINUTES = 25;
const LESSON_STEP_MINUTES = 30;

const timeStringToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const minutesToTimeString = (totalMinutes: number): string => {
  const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const m = (totalMinutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
};

/**
 * コーチの空き時間ブロック（例: "18:00:00"〜"22:00:00"）内で選択可能な
 * レッスン開始時刻の一覧を30分単位で生成する（例: 18:00, 18:30, ..., 21:30）。
 */
export const generateLessonStartTimeOptions = (blockStartTime: string, blockEndTime: string): string[] => {
  const start = timeStringToMinutes(blockStartTime.slice(0, 5));
  const end = timeStringToMinutes(blockEndTime.slice(0, 5));
  const options: string[] = [];
  for (let t = start; t + LESSON_MINUTES <= end; t += LESSON_STEP_MINUTES) {
    options.push(minutesToTimeString(t));
  }
  return options;
};

/** レッスン開始時刻からレッスン終了時刻（開始+25分）を算出する ("HH:MM" -> "HH:MM") */
export const getLessonEndTime = (startTime: string): string => {
  return minutesToTimeString(timeStringToMinutes(startTime) + LESSON_MINUTES);
};