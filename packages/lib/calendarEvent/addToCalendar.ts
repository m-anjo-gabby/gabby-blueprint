import { CALENDAR_EVENT_DEFAULT_DURATION_MS, type CalendarEventItem } from '@gabby/types/calendarEvent';

/**
 * カレンダーイベントを利用者自身のカレンダー（Google カレンダー / .ics を読めるカレンダーアプリ）に追加するための値を作る。
 * 日時は UTC（末尾 Z）で渡すため、受け取ったカレンダー側で利用者のタイムゾーンに変換される。
 * 参加URLは参加登録した人にだけ渡す（呼び出し側で locationUrl を指定した場合だけ含める）。
 */
type AddToCalendarEvent = Pick<CalendarEventItem, 'calendar_event_id' | 'title' | 'description' | 'start_datetime' | 'end_datetime'>;

interface AddToCalendarOptions {
  locationUrl?: string | null;
}

/** 20261012T110000Z 形式（Google カレンダー・iCalendar 共通） */
function toCalendarUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function getRange(event: AddToCalendarEvent): { start: string; end: string } {
  const startMs = new Date(event.start_datetime).getTime();
  const endMs = event.end_datetime ? new Date(event.end_datetime).getTime() : startMs + CALENDAR_EVENT_DEFAULT_DURATION_MS;
  return { start: toCalendarUtc(startMs), end: toCalendarUtc(endMs) };
}

function buildDetails(event: AddToCalendarEvent, locationUrl?: string | null): string {
  return [event.description, locationUrl].filter(Boolean).join('\n\n');
}

/** Google カレンダーの予定作成画面のURL */
export function buildGoogleCalendarUrl(event: AddToCalendarEvent, { locationUrl }: AddToCalendarOptions = {}): string {
  const { start, end } = getRange(event);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: buildDetails(event, locationUrl),
  });
  if (locationUrl) params.set('location', locationUrl);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** iCalendar のテキスト値のエスケープ（RFC 5545 3.3.11） */
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** .ics ファイルの中身（Apple カレンダー・Outlook 等で開くと予定に追加できる） */
export function buildIcsContent(event: AddToCalendarEvent, { locationUrl }: AddToCalendarOptions = {}): string {
  const { start, end } = getRange(event);
  const details = buildDetails(event, locationUrl);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gabby Academy//Blueprint//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // 同じイベントを再度追加した場合に、カレンダー側で同じ予定として扱われるようにする
    `UID:${event.calendar_event_id}@gabbyacademy.com`,
    `DTSTAMP:${toCalendarUtc(Date.now())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(details ? [`DESCRIPTION:${escapeIcsText(details)}`] : []),
    ...(locationUrl ? [`LOCATION:${escapeIcsText(locationUrl)}`, `URL:${locationUrl}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/** .ics ファイルをダウンロードさせる（ブラウザ専用） */
export function downloadIcsFile(event: AddToCalendarEvent, options: AddToCalendarOptions = {}): void {
  const blob = new Blob([buildIcsContent(event, options)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.title.replace(/[\\/:*?"<>|]/g, '_')}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
