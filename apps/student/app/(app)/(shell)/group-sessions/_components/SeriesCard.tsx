'use client';

import { useState } from 'react';
import { CheckCircle2, ExternalLink, ListChecks } from 'lucide-react';
import type { CalendarEventItem } from '@gabby/types/calendarEvent';
import { useToast } from '@gabby/lib/hooks/useToast';
import { Button } from '@/components/ui/button';
import { useEventParticipation } from '@/components/calendarEvent/useEventParticipation';
import { EventCoachLine, EventTiming, JoinedBadge, formatEventSlot } from '@/components/calendarEvent/EventMeta';
import { joinCalendarEventSeries } from '@/actions/calendarEventAction';
import { cn } from '@/lib/utils';
import { getJoinableSessions } from '../_lib/groupBySeries';

/** シリーズのカード・単発のイベントのカードの共通の枠（骨組みと同じ） */
export const SERIES_CARD_CLASS = 'rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6';

interface SessionRowProps {
  session: CalendarEventItem;
  nowMs: number | null;
  timezone: string;
  onParticipationChanged: (calendarEventId: string, isJoined: boolean) => void;
  onOpenDetail: (calendarEventId: string) => void;
}

/** 1回分の行（日時・内容・担当コーチと、参加する／入室する） */
export function SessionRow({ session, nowMs, timezone, onParticipationChanged, onOpenDetail }: SessionRowProps) {
  const { join, isSubmitting } = useEventParticipation(onParticipationChanged);
  const slot = formatEventSlot(session, timezone);
  const isJoined = session.rsvp_enabled && session.is_joined;
  const showJoinUrl = (isJoined || !session.rsvp_enabled) && !!session.location_url;

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4" data-testid="group-session-row">
      <button type="button" onClick={() => onOpenDetail(session.calendar_event_id)} className="group min-w-0 flex-1 text-left">
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted tabular-nums">
          <span>
            {slot.date} {slot.time}
          </span>
          <EventTiming event={session} nowMs={nowMs} timezone={timezone} />
        </p>
        <p className="mt-0.5 text-sm font-semibold text-ink group-hover:text-brand-strong">{session.title}</p>
        <EventCoachLine event={session} className="mt-0.5" />
      </button>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {isJoined && <JoinedBadge />}
        {showJoinUrl && (
          <Button type="button" size="sm" asChild>
            <a href={session.location_url!} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              入室する
            </a>
          </Button>
        )}
        {session.rsvp_enabled && !isJoined && (
          <Button type="button" size="sm" variant="outline" pending={isSubmitting} onClick={() => join(session.calendar_event_id)}>
            参加する
          </Button>
        )}
      </div>
    </li>
  );
}

interface SeriesCardProps {
  /** シリーズ名（単発のイベントのまとまりは「その他のイベント」） */
  title: string;
  description: string | null;
  /** シリーズID（単発のイベントのまとまりは null。「すべての回に参加する」を出さない） */
  seriesId: string | null;
  sessions: CalendarEventItem[];
  nowMs: number | null;
  timezone: string;
  /** URL の ?series= で開いたシリーズ（強調して表示する） */
  highlighted?: boolean;
  onParticipationChanged: (calendarEventId: string, isJoined: boolean) => void;
  onSeriesJoined: (calendarEventIds: string[]) => void;
  onOpenDetail: (calendarEventId: string) => void;
}

/** 説明の初期表示の行数（長い場合は「続きを読む」で開く） */
const DESCRIPTION_CLAMP = 'line-clamp-3';

/**
 * シリーズのカード（シリーズ名・説明・回の一覧）。まだ終わっていない未登録の回があれば「すべての回に参加する」を出す。
 * まとめての取り消しは置かない（取り消しは回ごとに詳細から行う）。
 */
export function SeriesCard({
  title,
  description,
  seriesId,
  sessions,
  nowMs,
  timezone,
  highlighted = false,
  onParticipationChanged,
  onSeriesJoined,
  onOpenDetail,
}: SeriesCardProps) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [isJoiningAll, setIsJoiningAll] = useState(false);
  const joinable = getJoinableSessions(sessions, nowMs);
  const rsvpCount = sessions.filter((s) => s.rsvp_enabled).length;

  const handleJoinAll = async () => {
    if (!seriesId) return;
    setIsJoiningAll(true);
    try {
      const result = await joinCalendarEventSeries(seriesId);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onSeriesJoined(result.joinedIds);
      showToast(`${result.joinedIds.length}回の参加を登録しました`, 'success');
    } finally {
      setIsJoiningAll(false);
    }
  };

  return (
    <section
      id={seriesId ? `series-${seriesId}` : undefined}
      aria-label={title}
      className={cn(SERIES_CARD_CLASS, highlighted && 'border-brand-200 ring-2 ring-brand-100')}
    >
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {description && (
        <div className="mt-1.5">
          <p className={cn('text-sm text-ink-soft whitespace-pre-line', !expanded && DESCRIPTION_CLAMP)}>{description}</p>
          {description.length > 120 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-semibold text-brand-strong hover:text-brand-900"
            >
              {expanded ? '閉じる' : '続きを読む'}
            </button>
          )}
        </div>
      )}

      {seriesId && rsvpCount > 1 && (
        <div className="mt-3">
          {joinable.length > 0 ? (
            <Button type="button" size="sm" pending={isJoiningAll} icon={<ListChecks />} onClick={handleJoinAll}>
              すべての回に参加する（{joinable.length}回）
            </Button>
          ) : (
            <p className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
              <CheckCircle2 size={14} />
              すべての回が参加予定です
            </p>
          )}
        </div>
      )}

      <ul className="mt-3 divide-y divide-line">
        {sessions.map((session) => (
          <SessionRow
            key={session.calendar_event_id}
            session={session}
            nowMs={nowMs}
            timezone={timezone}
            onParticipationChanged={onParticipationChanged}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </ul>
    </section>
  );
}
