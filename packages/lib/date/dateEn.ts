/**
 * ----------------------------------------------
 * 英語圏（コーチアプリ）向けの日付・時刻フォーマッター
 * ----------------------------------------------
 * apps/coachはプロトタイプ開発中で、コーチからのフィードバックにより表記スタイル
 * （月名表記か数値表記か、12時間制か24時間制か等）を変更する可能性がある。
 * そのため実際の表示形式は本ファイル冒頭の DATE_OPTIONS_EN / TIME_OPTIONS_EN の
 * 2つの定数だけに集約してある。表記を変更したい場合はこの2定数を書き換えるだけで、
 * 呼び出し側（各画面）を一切変更せずに全画面へ反映される。
 *
 * date.ts側の日本語ロケール（ja-JP）フォーマッター群はapps/admin・apps/student
 * （日本語UI）が使用しているため、本ファイルはそれらとは独立させている。
 */

const LOCALE_EN = 'en-US';

/** 日付部分の表示スタイル。現在の見本: "Sep 19, 2026" */
const DATE_OPTIONS_EN: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

/** 時刻部分の表示スタイル。現在の見本: "4:00 AM"（12時間制・秒なし） */
const TIME_OPTIONS_EN: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

/** コーチアプリのデフォルトタイムゾーン（プロフィール未設定時のみ使用する最終フォールバック） */
const DEFAULT_TIMEZONE_EN = 'America/New_York';

type DateInput = Date | string | number | null | undefined;

function toValidDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const date = input instanceof Date ? input : new Date(input);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * 日付のみを英語圏向け表記で返す。例: "Sep 19, 2026"
 */
export function formatDateEn(input: DateInput, timeZone: string = DEFAULT_TIMEZONE_EN): string {
  const date = toValidDate(input);
  if (!date) return '';
  return new Intl.DateTimeFormat(LOCALE_EN, { ...DATE_OPTIONS_EN, timeZone }).format(date);
}

/**
 * 日付+時刻を英語圏向け表記で返す。例: "Sep 19, 2026, 4:00 AM"
 */
export function formatDateTimeEn(input: DateInput, timeZone: string = DEFAULT_TIMEZONE_EN): string {
  const date = toValidDate(input);
  if (!date) return '';
  return new Intl.DateTimeFormat(LOCALE_EN, { ...DATE_OPTIONS_EN, ...TIME_OPTIONS_EN, timeZone }).format(date);
}
