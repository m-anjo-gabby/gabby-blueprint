'use client';

import { useEffect, useState } from 'react';
import type { CalendarEventItem, CalendarEventMessageItem } from '@gabby/types/calendarEvent';

/**
 * イベントの詳細に出すアナウンス（生徒/コーチ共通）。
 * 通常は一覧と一緒に取得済みの event.messages をそのまま返す（詳細を開いてから伸びないように）。
 * 参加登録・取消の直後など未取得（null / undefined）の場合だけ、各アプリのサーバーアクション fetchMessages で取得する
 * （見える範囲は参加状態で変わるため、参加状態ごとに取り直す）。
 */
export function useEventAnnouncements(
  event: Pick<CalendarEventItem, 'calendar_event_id' | 'is_joined' | 'messages'>,
  fetchMessages: (calendarEventId: string) => Promise<CalendarEventMessageItem[]>
): CalendarEventMessageItem[] {
  const [fetched, setFetched] = useState<{ key: string; messages: CalendarEventMessageItem[] } | null>(null);
  const needsFetch = event.messages == null;
  const eventId = event.calendar_event_id;
  const key = `${eventId}:${event.is_joined}`;

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    fetchMessages(eventId).then((messages) => {
      if (!cancelled) setFetched({ key, messages });
    });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, key, eventId, fetchMessages]);

  if (event.messages) return event.messages;
  return fetched?.key === key ? fetched.messages : [];
}
