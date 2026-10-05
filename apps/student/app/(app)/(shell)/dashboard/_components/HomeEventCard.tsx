'use client';

import { useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, ExternalLink, UsersRound } from 'lucide-react';
import { useNow } from '@gabby/lib/hooks/useNow';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { useServerSyncedState } from '@gabby/lib/hooks/useServerSyncedState';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { getCalendarEventPhase, type CalendarEventItem } from '@gabby/types/calendarEvent';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { AddToCalendarMenu } from '@/components/calendarEvent/AddToCalendarMenu';
import { CalendarEventCard } from '@/components/calendarEvent/CalendarEventCard';
import { useEventParticipation } from '@/components/calendarEvent/useEventParticipation';
import { formatTimeUntil } from '@/lib/sessionFormat';
import { cn } from '@/lib/utils';
import { HomeCard } from './HomeCard';

const CARD_TITLE = 'グループセッション';

/** 1件目の詳細の下に一覧で並べる件数 */
const MAX_OTHER_EVENTS = 2;

/** カードの中の並び（本番と骨組みで共有する）。幅が広いときは「次回」と「このあとの予定」を横に並べる */
const EVENT_LAYOUT = {
  grid: 'grid gap-3 @2xl:grid-cols-2',
  featured: 'rounded-control border border-brand-100 bg-brand-soft p-4',
  block: 'rounded-control bg-canvas p-4',
  blockTitle: 'text-xs text-ink-muted',
} as const;

/** 「10月12日(日)」「20:00〜21:00」（終了時刻が無い場合は「20:00〜」） */
function formatEventSlot(event: CalendarEventItem, timeZone: string): { date: string; time: string } {
  const dateFormat = new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'long', day: 'numeric', weekday: 'short' });
  const timeFormat = new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit' });
  const start = new Date(event.start_datetime);
  return {
    date: dateFormat.format(start),
    time: `${timeFormat.format(start)}〜${event.end_datetime ? timeFormat.format(new Date(event.end_datetime)) : ''}`,
  };
}

/** 開催までの状況（開催中 / 今日・明日の残り時間）。現在時刻の確定前と、2日以上先は出さない */
function EventTiming({ event, nowMs, timezone }: { event: CalendarEventItem; nowMs: number | null; timezone: string }) {
  if (nowMs === null) return null;
  const phase = getCalendarEventPhase(event, nowMs);
  if (phase === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-strong">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
        </span>
        開催中
      </span>
    );
  }
  const eventDate = toIsoDateInZone(event.start_datetime, timezone);
  const today = toIsoDateInZone(nowMs, timezone);
  const tomorrow = toIsoDateInZone(nowMs + 24 * 60 * 60 * 1000, timezone);
  const until = formatTimeUntil(event.start_datetime, nowMs);
  if (eventDate === today) return <span className="text-xs font-bold text-brand-strong">今日・あと{until}</span>;
  if (eventDate === tomorrow) return <span className="text-xs font-bold text-brand-strong">明日</span>;
  return null;
}

function JoinedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
      <CheckCircle2 size={11} />
      参加予定
    </span>
  );
}

interface FeaturedEventProps {
  event: CalendarEventItem;
  nowMs: number | null;
  timezone: string;
  onParticipationChanged: (calendarEventId: string, isJoined: boolean) => void;
  onOpenDetail: () => void;
}

/** 直近のイベント。参加登録前は「参加予定にする」、登録後は「参加する」（参加URL）を主役のボタンにする */
function FeaturedEvent({ event, nowMs, timezone, onParticipationChanged, onOpenDetail }: FeaturedEventProps) {
  const { join, isSubmitting } = useEventParticipation(onParticipationChanged);
  const slot = formatEventSlot(event, timezone);
  const isJoined = event.rsvp_enabled && event.is_joined;

  return (
    <section className={EVENT_LAYOUT.featured}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <h3 className={EVENT_LAYOUT.blockTitle}>次回の開催</h3>
        <EventTiming event={event} nowMs={nowMs} timezone={timezone} />
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 font-bold text-ink tabular-nums">
        <span className="text-lg">{slot.date}</span>
        <span className="text-base">{slot.time}</span>
      </p>
      <div className="mt-1 flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-bold text-ink">{event.title}</p>
        {isJoined && <JoinedBadge />}
      </div>
      {event.description && <p className="mt-1 line-clamp-2 text-xs text-ink-soft whitespace-pre-line">{event.description}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!event.rsvp_enabled ? (
          event.location_url && (
            <Button type="button" asChild>
              <a href={event.location_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                参加する
              </a>
            </Button>
          )
        ) : isJoined ? (
          <>
            {event.location_url && (
              <Button type="button" asChild>
                <a href={event.location_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  参加する
                </a>
              </Button>
            )}
            <AddToCalendarMenu event={event} />
          </>
        ) : (
          <Button type="button" pending={isSubmitting} icon={<UsersRound />} onClick={() => join(event.calendar_event_id)}>
            参加予定にする
          </Button>
        )}
        <button
          type="button"
          onClick={onOpenDetail}
          className="ml-auto inline-flex items-center gap-0.5 text-xs font-semibold text-brand-strong transition-colors hover:text-brand-900"
        >
          詳細
          <ChevronRight size={14} />
        </button>
      </div>
      {event.rsvp_enabled && !isJoined && (
        <p className="mt-2 text-[11px] text-ink-muted">参加予定にすると、参加用のリンクが表示されます。</p>
      )}
      {isJoined && !event.location_url && (
        <p className="mt-2 text-[11px] text-ink-muted">参加用のリンクは決まり次第ここに表示されます。</p>
      )}
    </section>
  );
}

/** 2件目以降のイベント（日時・タイトルだけを並べ、押すと詳細を開く） */
function OtherEvents({ events, timezone, onOpenDetail }: { events: CalendarEventItem[]; timezone: string; onOpenDetail: (id: string) => void }) {
  return (
    <section className={EVENT_LAYOUT.block}>
      <h3 className={EVENT_LAYOUT.blockTitle}>このあとの予定</h3>
      <ul className="mt-2 divide-y divide-line">
        {events.map((event) => {
          const slot = formatEventSlot(event, timezone);
          return (
            <li key={event.calendar_event_id}>
              <button
                type="button"
                onClick={() => onOpenDetail(event.calendar_event_id)}
                className="group flex w-full items-center gap-3 py-2.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-muted tabular-nums">
                    {slot.date} {slot.time}
                  </p>
                  <p className="truncate text-sm font-semibold text-ink">{event.title}</p>
                </div>
                {event.rsvp_enabled && event.is_joined && <JoinedBadge />}
                <ChevronRight size={16} className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EmptyEvents() {
  return (
    <section className={EVENT_LAYOUT.block}>
      <div className="flex items-start gap-3">
        <CalendarDays size={18} className="mt-0.5 shrink-0 text-ink-subtle" />
        <div>
          <p className="text-sm text-ink">次回の開催は、決まり次第ここでお知らせします。</p>
          <p className="mt-1 text-xs text-ink-muted">Gabbyのプロコーチから直接学べる、ご契約中の方限定の無料セッションです。</p>
        </div>
      </div>
    </section>
  );
}

/**
 * ホームのグループセッション（全プランの生徒に出す。ライブセッションの区画がある場合はその横に並べる）。
 * 直近の1件を大きく出して参加登録・参加を促し、2件目以降は一覧から詳細（カレンダーと同じ詳細）を開く。
 * 開催予定が無い場合も枠を残す（参加を促したい催しの場所を覚えてもらうため。骨組みとの切り替えでも並びが変わらない）。
 */
export function HomeEventCard({ events: serverEvents }: { events: CalendarEventItem[] }) {
  const nowMs = useNow();
  const timezone = useTimezone();
  const [events, setEvents] = useServerSyncedState(serverEvents);
  const [detailId, setDetailId] = useState<string | null>(null);

  // 表示中に終了したイベントは外す（現在時刻の確定前はサーバーの判定のまま出す）
  const visibleEvents = nowMs === null ? events : events.filter((e) => getCalendarEventPhase(e, nowMs) !== 'ended');
  const [featured, ...others] = visibleEvents;
  const detailEvent = events.find((e) => e.calendar_event_id === detailId) ?? null;

  const handleParticipationChanged = (calendarEventId: string, isJoined: boolean) => {
    setEvents((prev) => prev.map((e) => (e.calendar_event_id === calendarEventId ? { ...e, is_joined: isJoined } : e)));
  };

  return (
    <HomeCard title={CARD_TITLE}>
      <div className="@container">
        {featured ? (
          <div className={cn(EVENT_LAYOUT.grid, others.length === 0 && '@2xl:grid-cols-1')}>
            <FeaturedEvent
              event={featured}
              nowMs={nowMs}
              timezone={timezone}
              onParticipationChanged={handleParticipationChanged}
              onOpenDetail={() => setDetailId(featured.calendar_event_id)}
            />
            {others.length > 0 && (
              <OtherEvents events={others.slice(0, MAX_OTHER_EVENTS)} timezone={timezone} onOpenDetail={setDetailId} />
            )}
          </div>
        ) : (
          <EmptyEvents />
        )}
      </div>

      <Drawer open={detailEvent !== null} onOpenChange={(open) => !open && setDetailId(null)}>
        <DrawerContent className="mx-auto max-h-[85vh] max-w-2xl">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-base font-bold text-ink">
              {detailEvent ? formatEventSlot(detailEvent, timezone).date : ''}
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            {detailEvent && (
              <CalendarEventCard event={detailEvent} timezone={timezone} onParticipationChanged={handleParticipationChanged} />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </HomeCard>
  );
}

/** グループセッションのカードの骨組み（取得を待つ間。見出しと区画の枠は本物で描く） */
export function HomeEventCardSkeleton() {
  return (
    <HomeCard title={CARD_TITLE}>
      <section className={EVENT_LAYOUT.featured}>
        <h3 className={EVENT_LAYOUT.blockTitle}>次回の開催</h3>
        <Skeleton className="mt-2.5 h-5 w-48" />
        <Skeleton className="mt-2.5 h-4 w-40" />
        <Skeleton className="mt-5 h-9 w-36 rounded-control" />
      </section>
    </HomeCard>
  );
}
