'use client';

import { useState } from 'react';
import { CalendarDays, ChevronRight, ExternalLink, UsersRound } from 'lucide-react';
import { useNow } from '@gabby/lib/hooks/useNow';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { useServerSyncedState } from '@gabby/lib/hooks/useServerSyncedState';
import { getCalendarEventPhase, type CalendarEventItem } from '@gabby/types/calendarEvent';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AddToCalendarMenu } from '@/components/calendarEvent/AddToCalendarMenu';
import { EventDetailDrawer } from '@/components/calendarEvent/EventDetailDrawer';
import { useEventParticipation } from '@/components/calendarEvent/useEventParticipation';
import {
  EventCoachLine,
  EventSeriesLabel,
  EventTiming,
  JoinedBadge,
  formatEventSlot,
} from '@/components/calendarEvent/EventMeta';
import { cn } from '@/lib/utils';
import { HomeCard } from './HomeCard';

const CARD_TITLE = 'グループセッション';
/** 見出しの補助リンク（シリーズごとの一覧・過去のセッションを見る画面） */
const CARD_ACTION = { label: '一覧を見る', href: '/group-sessions' };

/** 1件目の詳細の下に一覧で並べる件数 */
const MAX_OTHER_EVENTS = 2;

/** カードの中の並び（本番と骨組みで共有する）。幅が広いときは「次回」と「このあとの予定」を横に並べる */
const EVENT_LAYOUT = {
  grid: 'grid gap-3 @2xl:grid-cols-2',
  featured: 'rounded-control border border-brand-100 bg-brand-soft p-4',
  block: 'rounded-control bg-canvas p-4',
  blockTitle: 'text-xs text-ink-muted',
} as const;

interface FeaturedEventProps {
  event: CalendarEventItem;
  nowMs: number | null;
  timezone: string;
  onParticipationChanged: (calendarEventId: string, isJoined: boolean) => void;
  onOpenDetail: () => void;
}

/** 直近のイベント。参加登録前は「参加する」、登録後は「入室する」（参加URL）を主役のボタンにする */
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
      <EventSeriesLabel event={event} className="mt-1" />
      <div className="mt-0.5 flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-bold text-ink">{event.title}</p>
        {isJoined && <JoinedBadge />}
      </div>
      <EventCoachLine event={event} className="mt-1" />
      {event.description && <p className="mt-1 line-clamp-2 text-xs text-ink-soft whitespace-pre-line">{event.description}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!event.rsvp_enabled ? (
          event.location_url && (
            <Button type="button" asChild>
              <a href={event.location_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                入室する
              </a>
            </Button>
          )
        ) : isJoined ? (
          <>
            {event.location_url && (
              <Button type="button" asChild>
                <a href={event.location_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  入室する
                </a>
              </Button>
            )}
            <AddToCalendarMenu event={event} />
          </>
        ) : (
          <Button type="button" pending={isSubmitting} icon={<UsersRound />} onClick={() => join(event.calendar_event_id)}>
            参加する
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
        <p className="mt-2 text-[11px] text-ink-muted">参加すると、入室用のリンクが表示されます。</p>
      )}
      {isJoined && !event.location_url && (
        <p className="mt-2 text-[11px] text-ink-muted">入室用のリンクは決まり次第ここに表示されます。</p>
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
                  <EventSeriesLabel event={event} />
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
    <HomeCard title={CARD_TITLE} action={CARD_ACTION}>
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

      <EventDetailDrawer
        event={detailEvent}
        timezone={timezone}
        onClose={() => setDetailId(null)}
        onParticipationChanged={handleParticipationChanged}
      />
    </HomeCard>
  );
}

/** グループセッションのカードの骨組み（取得を待つ間。見出しと区画の枠は本物で描く） */
export function HomeEventCardSkeleton() {
  return (
    <HomeCard title={CARD_TITLE} action={CARD_ACTION}>
      <section className={EVENT_LAYOUT.featured}>
        <h3 className={EVENT_LAYOUT.blockTitle}>次回の開催</h3>
        <Skeleton className="mt-2.5 h-5 w-48" />
        <Skeleton className="mt-2.5 h-4 w-40" />
        <Skeleton className="mt-5 h-9 w-36 rounded-control" />
      </section>
    </HomeCard>
  );
}
