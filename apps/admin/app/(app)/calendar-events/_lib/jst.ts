/**
 * カレンダーイベントの登録画面の日時入力（日本時間の日付・時刻）とUTCの相互変換。
 * イベントの登録・編集フォームと、シリーズの「回をまとめて追加」で共有する。
 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTCの日時文字列を日本時間の {date: "YYYY-MM-DD", time: "HH:MM"} に分解する */
export function utcToJstParts(utcStr: string | null | undefined): { date: string; time: string } {
  if (!utcStr) return { date: '', time: '' };
  const d = new Date(utcStr);
  if (isNaN(d.getTime())) return { date: '', time: '' };
  const iso = new Date(d.getTime() + JST_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** 今日（日本時間）の "YYYY-MM-DD" */
export function todayJstDateStr(): string {
  return new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" に日数を足す */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return dateStr;
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
