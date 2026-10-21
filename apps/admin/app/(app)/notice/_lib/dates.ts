import { toIsoDateInZone } from '@gabby/lib/date/date';

/** 公開日・終了日は日本時間の日付で入力する（保存時の変換 adminNoticeAction の jstToUtcIso と同じ） */
const NOTICE_TIMEZONE = 'Asia/Tokyo';

/** UTC の日時を <input type="date"> 用の JST の日付（YYYY-MM-DD）にする */
export function toNoticeInputDate(utc: string | null | undefined): string {
  return utc ? toIsoDateInZone(utc, NOTICE_TIMEZONE) : '';
}

/** 新規作成時の公開日の初期値（今日の JST の日付）。サーバーとブラウザで日付がずれないよう、ページで決めて渡す */
export function getDefaultNoticePublishedDate(): string {
  return toIsoDateInZone(new Date(), NOTICE_TIMEZONE);
}
