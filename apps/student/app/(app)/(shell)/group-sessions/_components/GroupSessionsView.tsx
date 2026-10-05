'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, History } from 'lucide-react';
import { getCalendarEventPhase, type CalendarEventItem } from '@gabby/types/calendarEvent';
import { useNow } from '@gabby/lib/hooks/useNow';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { useServerSyncedState } from '@gabby/lib/hooks/useServerSyncedState';
import { useRefreshOnRestoredRender } from '@gabby/lib/hooks/useRefreshOnRestoredRender';
import { EventDetailDrawer } from '@/components/calendarEvent/EventDetailDrawer';
import { EventCoachLine, EventSeriesLabel, formatEventSlot } from '@/components/calendarEvent/EventMeta';
import { scrollIntoContainer } from '@/lib/scroll';
import { groupBySeries } from '../_lib/groupBySeries';
import { GroupSessionsHeader, parseGroupSessionsTab, type GroupSessionsTab } from './GroupSessionsSkeleton';
import { SERIES_CARD_CLASS, SeriesCard } from './SeriesCard';

interface GroupSessionsViewProps {
  /** これからの回（開催前・開催中。開始順） */
  upcoming: CalendarEventItem[];
  /** 参加登録した過去の回（新しい順） */
  past: CalendarEventItem[];
  /** サーバー描画ごとのID（キャッシュ済みの画面の再利用を検知して取り直すために使う） */
  renderId: string;
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof CalendarDays; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-card border border-line bg-surface text-ink-subtle">
        <Icon size={22} />
      </div>
      <p className="text-sm font-bold text-ink-muted">{title}</p>
      <p className="mt-1.5 text-xs text-ink-subtle">{description}</p>
    </div>
  );
}

/** 参加登録した過去の回（日時・シリーズ名・内容・担当コーチ。押すと詳細） */
function PastSessions({ sessions, timezone, onOpenDetail }: { sessions: CalendarEventItem[]; timezone: string; onOpenDetail: (id: string) => void }) {
  if (sessions.length === 0) {
    return <EmptyState icon={History} title="参加登録した過去のセッションはありません" description="直近半年に参加予定にしたセッションが、ここに表示されます。" />;
  }
  return (
    <section aria-label="過去のセッション" className={SERIES_CARD_CLASS}>
      <ul className="divide-y divide-line">
        {sessions.map((session) => {
          const slot = formatEventSlot(session, timezone);
          return (
            <li key={session.calendar_event_id}>
              <button type="button" onClick={() => onOpenDetail(session.calendar_event_id)} className="group w-full py-3 text-left">
                <p className="text-xs text-ink-muted tabular-nums">
                  {slot.date} {slot.time}
                </p>
                <EventSeriesLabel event={session} className="mt-0.5" />
                <p className="text-sm font-semibold text-ink group-hover:text-brand-strong">{session.title}</p>
                <EventCoachLine event={session} className="mt-0.5" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-ink-subtle">参加予定にしていた回を表示しています（直近半年）。</p>
    </section>
  );
}

/**
 * グループセッションの一覧。「これから」はシリーズごとのカード（説明・回の一覧・全回に参加予定にする）と、
 * 単発のイベントの「その他のイベント」。「過去のセッション」は参加登録した終了済みの回。
 * タブは URL の ?tab=、イベントの詳細から開いた場合は ?series= のシリーズまで移動して強調する。
 */
export function GroupSessionsView({ upcoming: serverUpcoming, past: serverPast, renderId }: GroupSessionsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseGroupSessionsTab(searchParams.get('tab'));
  const focusSeriesId = searchParams.get('series');
  const nowMs = useNow();
  const timezone = useTimezone();
  const [upcoming, setUpcoming] = useServerSyncedState(serverUpcoming);
  const [past, setPast] = useServerSyncedState(serverPast);
  const [detailId, setDetailId] = useState<string | null>(null);
  // 「戻る・進む」等でキャッシュ済みの画面が再利用された場合は、最新のデータに取り直す
  useRefreshOnRestoredRender(renderId);

  // 表示中に終了した回は外す（現在時刻の確定前はサーバーの判定のまま出す）
  const visibleUpcoming = nowMs === null ? upcoming : upcoming.filter((e) => getCalendarEventPhase(e, nowMs) !== 'ended');
  const { groups, singles } = groupBySeries(visibleUpcoming);
  const detailEvent = [...upcoming, ...past].find((e) => e.calendar_event_id === detailId) ?? null;

  const updateJoined = (ids: Set<string>, isJoined: boolean) => {
    const apply = (list: CalendarEventItem[]) => list.map((e) => (ids.has(e.calendar_event_id) ? { ...e, is_joined: isJoined } : e));
    setUpcoming(apply);
    setPast(apply);
  };
  const handleParticipationChanged = (calendarEventId: string, isJoined: boolean) => updateJoined(new Set([calendarEventId]), isJoined);

  const handleTabChange = (next: GroupSessionsTab) => {
    router.replace(next === 'past' ? `${pathname}?tab=past` : pathname, { scroll: false });
  };

  // イベントの詳細から開いた場合は、そのシリーズまで移動する（一度だけ）
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!focusSeriesId || tab !== 'upcoming' || scrolledRef.current) return;
    const el = document.getElementById(`series-${focusSeriesId}`);
    if (el) {
      scrollIntoContainer(el);
      scrolledRef.current = true;
    }
  }, [focusSeriesId, tab]);

  return (
    <>
      <GroupSessionsHeader tab={tab} onTabChange={handleTabChange} />

      {tab === 'past' ? (
        <PastSessions sessions={past} timezone={timezone} onOpenDetail={setDetailId} />
      ) : groups.length === 0 && singles.length === 0 ? (
        <EmptyState icon={CalendarDays} title="開催予定のグループセッションはありません" description="次回の開催は、決まり次第ここでお知らせします。" />
      ) : (
        <div className="space-y-4">
          {groups.map(({ series, sessions }) => (
            <SeriesCard
              key={series.series_id}
              title={series.title}
              description={series.description}
              seriesId={series.series_id}
              sessions={sessions}
              nowMs={nowMs}
              timezone={timezone}
              highlighted={series.series_id === focusSeriesId}
              onParticipationChanged={handleParticipationChanged}
              onSeriesJoined={(ids) => updateJoined(new Set(ids), true)}
              onOpenDetail={setDetailId}
            />
          ))}
          {singles.length > 0 && (
            <SeriesCard
              title={groups.length > 0 ? 'その他のイベント' : 'グループセッション'}
              description={null}
              seriesId={null}
              sessions={singles}
              nowMs={nowMs}
              timezone={timezone}
              onParticipationChanged={handleParticipationChanged}
              onSeriesJoined={() => {}}
              onOpenDetail={setDetailId}
            />
          )}
        </div>
      )}

      <EventDetailDrawer
        event={detailEvent}
        timezone={timezone}
        onClose={() => setDetailId(null)}
        onParticipationChanged={handleParticipationChanged}
        showSeriesLink={false}
      />
    </>
  );
}
