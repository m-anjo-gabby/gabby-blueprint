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
  timeZone: string = 'Asia/Tokyo',
  withSeconds: boolean = true
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
      ...(withSeconds ? { second: '2-digit' as const } : {}),
      timeZone: timeZone,
    }).format(date);
  } catch (e) {
    return formatDateTimeByZone(dateString, 'Asia/Tokyo', withSeconds);
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

/** 指定タイムゾーンでの、指定UTC瞬間における「UTCからのオフセット(分)」を求める */
function getTimeZoneOffsetMinutes(utcInstant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(utcInstant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUtc - utcInstant.getTime()) / 60000;
}

/** "YYYY-MM-DDTHH:MM:SS" のウォールクロック時刻を、指定タイムゾーンでの時刻とみなしてUTC Dateへ変換する */
function zonedWallClockToUtc(wallClock: string, timeZone: string): Date {
  const naiveUtc = new Date(`${wallClock}Z`);
  const offsetMinutes = getTimeZoneOffsetMinutes(naiveUtc, timeZone);
  return new Date(naiveUtc.getTime() - offsetMinutes * 60000);
}

/**
 * fromTimeZoneの「今日」以降で、直近に指定曜日と一致する日付をYYYY-MM-DDで返す。
 * DSTの有無は暦日によって変わるため、固定の基準日ではなく直近の実在日を使うことで、
 * fn_generate_sessions_for_scheduleが実際に生成するSessionのオフセットに近づける。
 */
function nextOccurrenceDateInZone(dayOfWeek: number, timeZone: string): string {
  const todayStr = toIsoDateInZone(new Date(), timeZone);
  const todayDow = new Date(`${todayStr}T00:00:00Z`).getUTCDay();
  const diffDays = (dayOfWeek - todayDow + 7) % 7;
  const anchor = new Date(`${todayStr}T00:00:00Z`);
  return new Date(anchor.getTime() + diffDays * 86400000).toISOString().slice(0, 10);
}

/**
 * 週次の曜日+時刻パターン（例: コーチのローカル基準の「火曜18:00-22:00」）を、
 * 別のタイムゾーンでの曜日+時刻表示に変換する（コーチ空き時間の生徒向け表示専用）。
 * 直近の実在日（fromTimeZoneの「今日」以降で最初に該当曜日となる日）を基準にオフセットを
 * 算出するため、DSTの有無も実態に近い形で反映される。実際のセッション日時（絶対時刻）は
 * DB側のfn_generate_sessions_for_scheduleがcoach_timezoneを使ってAT TIME ZONE変換するため、
 * 本関数はUI表示専用の近似変換である（DST切り替え直後・直前の週はズレる場合がある）。
 */
export const convertWeeklyTimeZone = (
  input: { day_of_week: number; start_time: string; end_time: string },
  fromTimeZone: string,
  toTimeZone: string
): { day_of_week: number; start_time: string; end_time: string } => {
  const startTime = input.start_time.slice(0, 5);
  const endTime = input.end_time.slice(0, 5);

  if (fromTimeZone === toTimeZone) {
    return { day_of_week: input.day_of_week, start_time: startTime, end_time: endTime };
  }

  const dateStr = nextOccurrenceDateInZone(input.day_of_week, fromTimeZone);

  const startUtc = zonedWallClockToUtc(`${dateStr}T${startTime}:00`, fromTimeZone);
  const durationMinutes = timeStringToMinutes(endTime) - timeStringToMinutes(startTime);
  const endUtc = new Date(startUtc.getTime() + durationMinutes * 60000);

  const targetDateStr = toIsoDateInZone(startUtc, toTimeZone);
  const targetDayOfWeek = new Date(`${targetDateStr}T00:00:00Z`).getUTCDay();

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: toTimeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
  });
  const formatTime = (d: Date) => {
    const p = timeFormatter.formatToParts(d);
    const h = p.find((x) => x.type === 'hour')?.value ?? '00';
    const m = p.find((x) => x.type === 'minute')?.value ?? '00';
    return `${h}:${m}`;
  };

  return {
    day_of_week: targetDayOfWeek,
    start_time: formatTime(startUtc),
    end_time: formatTime(endUtc),
  };
};

export interface FirstLiveSessionOccurrence {
  /** 初回ライブセッションの絶対時刻（UTC） */
  instant: Date;
  /** targetTimeZoneでの曜日 (0:日...6:土) */
  day_of_week: number;
  /** targetTimeZoneでの開始時刻 "HH:MM" */
  start_time: string;
}

/**
 * 週次の曜日+時刻パターン（sourceTimeZoneのローカル時刻基準）について、
 * 「現在時刻から実時間で24時間以上先」となる直近の日時（初回ライブセッション日）を求め、
 * targetTimeZoneでの表示用に変換する。
 * 単純に暦日で「翌日」を加算すると、タイムゾーン差によっては実際には数時間しか
 * 先でないケースがあるため、必ず now+24時間（絶対時刻）を下限として判定する。
 */
export const getFirstLiveSessionOccurrence = (
  dayOfWeek: number,
  startTime: string,
  sourceTimeZone: string,
  targetTimeZone: string,
  now: Date = new Date()
): FirstLiveSessionOccurrence => {
  const time = startTime.slice(0, 5);
  const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const thresholdDateStr = toIsoDateInZone(threshold, sourceTimeZone);
  const thresholdDow = new Date(`${thresholdDateStr}T00:00:00Z`).getUTCDay();
  const diffDays = (dayOfWeek - thresholdDow + 7) % 7;
  let candidateDateStr = new Date(new Date(`${thresholdDateStr}T00:00:00Z`).getTime() + diffDays * 86400000)
    .toISOString()
    .slice(0, 10);
  let instant = zonedWallClockToUtc(`${candidateDateStr}T${time}:00`, sourceTimeZone);

  // 該当曜日ちょうどでも、その日の指定時刻が閾値(now+24h)より前ならその日は無効 → 翌週へ
  if (instant.getTime() < threshold.getTime()) {
    candidateDateStr = new Date(new Date(`${candidateDateStr}T00:00:00Z`).getTime() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    instant = zonedWallClockToUtc(`${candidateDateStr}T${time}:00`, sourceTimeZone);
  }

  const targetDateStr = toIsoDateInZone(instant, targetTimeZone);
  const targetDayOfWeek = new Date(`${targetDateStr}T00:00:00Z`).getUTCDay();

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: targetTimeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
  });
  const parts = timeFormatter.formatToParts(instant);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';

  return { instant, day_of_week: targetDayOfWeek, start_time: `${h}:${m}` };
};