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

/** 日付だけの値（DBの date 型。例: 2026-10-01） */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 日付の表示に使うタイムゾーン。日付だけの値は記録した時点のタイムゾーンで確定した暦の日付のため、
 * タイムゾーンをまたいで変換しない（`new Date('2026-10-01')` はUTCの0時になるため、UTCのまま表示する）。
 */
const zoneForDate = (date: Date | string | number, timeZone: string): string =>
  typeof date === 'string' && DATE_ONLY_PATTERN.test(date) ? 'UTC' : timeZone;

/**
 * 汎用的な日付フォーマッター
 * @param dateString UTCの日時文字列（日付だけの値はそのままの日付で表示する）
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
      timeZone: zoneForDate(dateString, timeZone),
    }).format(date).replace(/\//g, '-');
  } catch {
    // 不正なタイムゾーンが渡された場合のフォールバック
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
 * 日付だけの値（DBの date 型）は変換せず、そのままの日付を返します。
 */
export const toIsoDateInZone = (date: Date | string | number, timeZone: string): string => {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: zoneForDate(date, timeZone), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

export type TimeOfDayCategory = 'morning' | 'day' | 'evening' | 'night';

/** 指定タイムゾーンでの時刻(0-23時)を取得する */
export const getHourInZone = (dateString: string, timeZone: string): number => {
  try {
    return Number(
      new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(dateString))
    );
  } catch {
    return new Date(dateString).getHours();
  }
};

/**
 * 時刻(0-23時)から朝/昼/夕/夜のカテゴリを判定する（相手のタイムゾーンでの時間帯をアイコンで
 * 直感的に示すための分類。予約・キャンセル振替候補の日時選択画面で使用）
 */
export const getTimeOfDayCategory = (hour: number): TimeOfDayCategory => {
  if (hour >= 5 && hour < 8) return 'morning';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
};

/** 相手にとって非常識な時間帯（0:00-6:59）かどうかを判定する */
export const isInconsiderateHour = (hour: number): boolean => hour < 7;

/**
 * 指定されたタイムゾーンに基づき、年月を (YYYY-MM) 形式で取得します。
 */
export const toIsoMonthInZone = (date: Date | string | number, timeZone: string): string => {
  return toIsoDateInZone(date, timeZone).slice(0, 7);
};

/**
 * 表示用の日付フォーマッター (YYYY/MM/DD)。日付だけの値（DBの date 型）はそのままの日付で表示する
 */
export const formatZonedDate = (date: Date | string | number | null | undefined, timeZone: string): string => {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: zoneForDate(date, timeZone || 'Asia/Tokyo'),
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
 * 専属コーチマッチング機能: セッション枠計算ユーティリティ
 * ----------------------------------------------
 * 1セッション25分・30分単位の枠が前提（Coach Availability登録時の業務ルールに準拠）。
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
 * セッション開始時刻の一覧を30分単位で生成する（例: 18:00, 18:30, ..., 21:30）。
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

/** セッション開始時刻からセッション終了時刻（開始+25分）を算出する ("HH:MM" -> "HH:MM") */
export const getLessonEndTime = (startTime: string): string => {
  return minutesToTimeString(timeStringToMinutes(startTime) + LESSON_MINUTES);
};

/** 2つの時間帯（"HH:MM"、終了時刻は含まない半開区間）が重なっているかを判定する */
export const doTimeRangesOverlap = (
  aStart: string, aEnd: string, bStart: string, bEnd: string
): boolean => {
  const aS = timeStringToMinutes(aStart.slice(0, 5));
  const aE = timeStringToMinutes(aEnd.slice(0, 5));
  const bS = timeStringToMinutes(bStart.slice(0, 5));
  const bE = timeStringToMinutes(bEnd.slice(0, 5));
  return aS < bE && aE > bS;
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
export function zonedWallClockToUtc(wallClock: string, timeZone: string): Date {
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
 * 週次の曜日+時刻パターン（例: UTC基準の空き時間「火曜09:00-13:00」、生徒の申請時のタイムゾーン基準の
 * 定期スケジュール「火曜20:00」）を、別のタイムゾーンでの曜日+時刻表示に変換する。
 * 直近の実在日（fromTimeZoneの「今日」以降で最初に該当曜日となる日）を基準にオフセットを
 * 算出するため、DSTの有無も実態に近い形で反映される。実際のセッション日時（絶対時刻）は
 * DB側のfn_generate_sessions_for_scheduleがschedule_timezoneを使ってAT TIME ZONE変換するため、
 * 本関数は表示用の近似変換である（DST切り替え直後・直前の週はズレる場合がある。期間中の変化は
 * getWeeklyTimeChanges で求める）。
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
 * notBefore を渡すと、それより前の回も対象外にする（開始前の契約で申請する場合の契約開始日時）。
 */
export const getFirstLiveSessionOccurrence = (
  dayOfWeek: number,
  startTime: string,
  sourceTimeZone: string,
  targetTimeZone: string,
  now: Date = new Date(),
  notBefore?: Date
): FirstLiveSessionOccurrence => {
  const time = startTime.slice(0, 5);
  const threshold = new Date(Math.max(now.getTime() + 24 * 60 * 60 * 1000, notBefore?.getTime() ?? 0));

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

/**
 * 個別予約リクエスト・キャンセル時の振替候補提案について、「開始◯時間以上先」を
 * 求めるDB側ルール(create_session_booking_request/cancel_session等のRPC参照)と揃えた
 * 最低リードタイム(時間)。UI側は申請・提案の入力中にインラインで参考表示するための
 * ソフトチェックとして使う（最終的な整合性は常にRPC側で担保する）。DB側の値を変更する
 * 場合は、この値もあわせて更新すること。
 */
export const MIN_SESSION_BOOKING_LEAD_HOURS = 24;

/** 指定日時が、現在時刻からhours時間以上先かどうかを判定する */
export const isAtLeastHoursFromNow = (datetime: string | Date, hours: number): boolean => {
  const target = typeof datetime === 'string' ? new Date(datetime) : datetime;
  if (isNaN(target.getTime())) return false;
  return target.getTime() - Date.now() >= hours * 60 * 60 * 1000;
};

/**
 * 指定タイムゾーンの、指定時点でのUTCからの時差（分。東側が正。例: Asia/Tokyo は 540）。
 * 内部の換算は秒単位の表示とミリ秒単位の時刻を比べるため、ミリ秒の端数を落としてから求める（端数があると分が小数になる）。
 */
export const getUtcOffsetMinutes = (timeZone: string, at: Date = new Date()): number =>
  getTimeZoneOffsetMinutes(new Date(Math.floor(at.getTime() / 1000) * 1000), timeZone);

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/**
 * 週の中の位置（曜日+その日の分）を deltaMinutes だけずらす（週をまたぐ場合は折り返す）。
 * UTC基準の空き時間とコーチの現地時刻の、1つの時差での相互換算に使う（getUtcOffsetMinutes と組み合わせる）。
 */
export const shiftWeeklyMinute = (
  dayOfWeek: number,
  minuteOfDay: number,
  deltaMinutes: number
): { day_of_week: number; minute_of_day: number } => {
  const total = (((dayOfWeek * MINUTES_PER_DAY + minuteOfDay + deltaMinutes) % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
  return { day_of_week: Math.floor(total / MINUTES_PER_DAY), minute_of_day: total % MINUTES_PER_DAY };
};

const formatHourMinuteInZone = (instant: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instant);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
};

/**
 * 毎週の枠（timeZoneの現地の曜日・時刻）の、from〜to に開始する各回の日時（UTC）を返す
 * （DB側の fn_weekly_occurrences / fn_generate_sessions_for_schedule と同じ変換）。
 */
export const listWeeklyOccurrences = (
  dayOfWeek: number,
  startTime: string,
  timeZone: string,
  from: Date,
  to: Date
): Date[] => {
  const time = startTime.slice(0, 5);
  const fromDateStr = toIsoDateInZone(from, timeZone);
  const fromDow = new Date(`${fromDateStr}T00:00:00Z`).getUTCDay();
  let cursor = new Date(`${fromDateStr}T00:00:00Z`).getTime() + ((dayOfWeek - fromDow + 7) % 7) * 86400000;
  const result: Date[] = [];
  for (;;) {
    const dateStr = new Date(cursor).toISOString().slice(0, 10);
    const instant = zonedWallClockToUtc(`${dateStr}T${time}:00`, timeZone);
    if (instant.getTime() > to.getTime()) break;
    if (instant.getTime() >= from.getTime()) result.push(instant);
    cursor += 7 * 86400000;
  }
  return result;
};

export interface WeeklyTimeChange {
  /** この曜日・時刻になる最初の回の日時（UTC） */
  from: Date;
  /** targetTimeZoneでの曜日 (0:日...6:土) */
  day_of_week: number;
  /** targetTimeZoneでの開始時刻 "HH:MM" */
  start_time: string;
}

/**
 * 毎週の枠（sourceTimeZoneの現地の曜日・時刻）を targetTimeZone で見たときの曜日・時刻を、from〜to の期間で
 * 変わるごとに返す（先頭は最初の回）。夏時間の切り替えで、生徒の時刻で固定した枠のコーチ側の時刻が
 * 期間の途中で変わる場合に、変わる日と変わった後の時刻を示すために使う。回が無ければ空配列。
 */
export const getWeeklyTimeChanges = (
  dayOfWeek: number,
  startTime: string,
  sourceTimeZone: string,
  targetTimeZone: string,
  from: Date,
  to: Date
): WeeklyTimeChange[] => {
  const changes: WeeklyTimeChange[] = [];
  for (const instant of listWeeklyOccurrences(dayOfWeek, startTime, sourceTimeZone, from, to)) {
    const targetDateStr = toIsoDateInZone(instant, targetTimeZone);
    const day = new Date(`${targetDateStr}T00:00:00Z`).getUTCDay();
    const start = formatHourMinuteInZone(instant, targetTimeZone);
    const last = changes[changes.length - 1];
    if (!last || last.day_of_week !== day || last.start_time !== start) {
      changes.push({ from: instant, day_of_week: day, start_time: start });
    }
  }
  return changes;
};
