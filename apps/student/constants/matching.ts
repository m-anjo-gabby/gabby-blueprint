import { DayOfWeek } from '@gabby/types/coachAvailability';

/** 専属コーチマッチング機能の曜日ラベル（0:日 ... 6:土、com_m_coach_availability.day_of_weekに準拠） */
export const DAY_OF_WEEK_LABEL_JA: Record<DayOfWeek, string> = {
  0: '日曜日',
  1: '月曜日',
  2: '火曜日',
  3: '水曜日',
  4: '木曜日',
  5: '金曜日',
  6: '土曜日',
};

export interface TimeBucket {
  key: string;
  label: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"（日付をまたがない終端として扱う。24:00は「それ以降すべて」の意）
}

/**
 * コーチ検索フィルター用の大まかな時間帯区分。
 * 正確なレッスン開始時刻は、コーチ選択後のカレンダー（25分刻み）で別途確定するため、
 * ここでは絞り込みやすさを優先し、大くくりの4区分のみを用意する。
 */
export const TIME_BUCKETS: TimeBucket[] = [
  { key: 'morning', label: '午前', start: '05:00', end: '12:00' },
  { key: 'afternoon', label: '午後', start: '12:00', end: '17:00' },
  { key: 'evening', label: '夜', start: '17:00', end: '22:00' },
  { key: 'night', label: '深夜', start: '22:00', end: '24:00' },
];

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aEnd > bStart && aStart < bEnd;
}

/**
 * タイムゾーン変換後の空き時間ブロック（表示用タイムゾーン基準の値）が、指定の時間帯バケットと
 * 重なるか判定する。変換により終了時刻が開始時刻以下になる場合（表示上、日をまたぐ場合）は、
 * [開始, 24:00) と [0:00, 終了) の2区間として扱う（単純な文字列比較だと "0:00" が最小値扱いになり
 * 常に不一致になってしまうため）。
 */
export function overlapsTimeBucket(startTime: string, endTime: string, bucket: TimeBucket): boolean {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const bucketStart = timeToMinutes(bucket.start);
  const bucketEnd = timeToMinutes(bucket.end);

  if (endMin > startMin) {
    return rangesOverlap(startMin, endMin, bucketStart, bucketEnd);
  }
  return rangesOverlap(startMin, 24 * 60, bucketStart, bucketEnd) || rangesOverlap(0, endMin, bucketStart, bucketEnd);
}

/**
 * 空き時間の1ブロック（表示用day_of_week/start_time/end_time）が、コーチ検索フィルターの
 * 選択条件に一致するか判定する。曜日・時間帯のいずれも未選択の条件は無視する（絞り込みなし扱い）。
 * コーチ一覧の絞り込み（該当コーチかどうか）と、コーチカード内での枠の優先表示の両方で共通利用する。
 */
export function slotMatchesFilter(
  day: DayOfWeek,
  startTime: string,
  endTime: string,
  selectedDays: Set<DayOfWeek>,
  selectedTimeBuckets: Set<string>
): boolean {
  if (selectedDays.size > 0 && !selectedDays.has(day)) return false;
  if (selectedTimeBuckets.size > 0) {
    const bucketMatch = TIME_BUCKETS.some(
      (bucket) => selectedTimeBuckets.has(bucket.key) && overlapsTimeBucket(startTime, endTime, bucket)
    );
    if (!bucketMatch) return false;
  }
  return true;
}
