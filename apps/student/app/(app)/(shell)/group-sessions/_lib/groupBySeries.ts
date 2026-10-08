import { getCalendarEventPhase, type CalendarEventItem, type CalendarEventSeriesSummary } from '@gabby/types/calendarEvent';

export interface SeriesGroup {
  series: CalendarEventSeriesSummary;
  /** シリーズの回（開始順） */
  sessions: CalendarEventItem[];
}

/**
 * これからのイベント（開始順）を、シリーズごとのまとまりと単発のイベントに分ける。
 * シリーズの並びは、そのシリーズの最初の回の開始順（＝次に始まるシリーズが先）。
 */
export function groupBySeries(events: CalendarEventItem[]): { groups: SeriesGroup[]; singles: CalendarEventItem[] } {
  const groups = new Map<string, SeriesGroup>();
  const singles: CalendarEventItem[] = [];
  for (const event of events) {
    if (!event.series) {
      singles.push(event);
      continue;
    }
    const group = groups.get(event.series.series_id) ?? { series: event.series, sessions: [] };
    group.sessions.push(event);
    groups.set(event.series.series_id, group);
  }
  return { groups: [...groups.values()], singles };
}

/** シリーズの「すべての回に参加する」の対象（参加確認があり、終了しておらず、まだ参加登録していない回） */
export function getJoinableSessions(sessions: CalendarEventItem[], nowMs: number | null): CalendarEventItem[] {
  return sessions.filter(
    (s) => s.rsvp_enabled && !s.is_joined && (nowMs === null || getCalendarEventPhase(s, nowMs) !== 'ended')
  );
}
