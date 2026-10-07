import { CheckCircle2, ChevronRight, UserRound } from 'lucide-react';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { getCalendarEventPhase, type CalendarEventItem } from '@gabby/types/calendarEvent';
import { formatTimeUntil } from '@/lib/sessionFormat';
import { cn } from '@/lib/utils';

/*
 * カレンダーイベント（グループセッション等）の表示部品。ホームのカード・グループセッションの一覧・イベントの詳細で共有する。
 */

/** 「10月12日(日)」「20:00〜21:00」（終了時刻が無い場合は「20:00〜」） */
export function formatEventSlot(event: Pick<CalendarEventItem, 'start_datetime' | 'end_datetime'>, timeZone: string): { date: string; time: string } {
  const dateFormat = new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'long', day: 'numeric', weekday: 'short' });
  const timeFormat = new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit' });
  const start = new Date(event.start_datetime);
  return {
    date: dateFormat.format(start),
    time: `${timeFormat.format(start)}〜${event.end_datetime ? timeFormat.format(new Date(event.end_datetime)) : ''}`,
  };
}

/** 担当コーチの表示名（「Suzanne・Nao」）。未設定なら null */
export function formatEventCoachNames(event: Pick<CalendarEventItem, 'coaches'>): string | null {
  const names = (event.coaches ?? []).map((c) => c.user_name).filter((name): name is string => !!name);
  return names.length > 0 ? names.join('・') : null;
}

/** 開催までの状況（開催中 / 今日・明日の残り時間）。現在時刻の確定前と、2日以上先は出さない */
export function EventTiming({ event, nowMs, timezone }: { event: CalendarEventItem; nowMs: number | null; timezone: string }) {
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
  if (phase === 'ended') return null;
  const eventDate = toIsoDateInZone(event.start_datetime, timezone);
  const today = toIsoDateInZone(nowMs, timezone);
  const tomorrow = toIsoDateInZone(nowMs + 24 * 60 * 60 * 1000, timezone);
  const until = formatTimeUntil(event.start_datetime, nowMs);
  if (eventDate === today) return <span className="text-xs font-bold text-brand-strong">今日・あと{until}</span>;
  if (eventDate === tomorrow) return <span className="text-xs font-bold text-brand-strong">明日</span>;
  return null;
}

/** 参加登録済みのラベル */
export function JoinedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
      <CheckCircle2 size={11} />
      参加予定
    </span>
  );
}

/** 「詳細 ›」（イベントの詳細を開く文字のリンク。ホームのカード・グループセッションの一覧の行の右端に置く） */
export function EventDetailLink({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-brand-strong transition-colors hover:text-brand-900', className)}
    >
      詳細
      <ChevronRight size={14} />
    </button>
  );
}

/** シリーズ名（シリーズに属する回のみ。各回のタイトルの上に小さく出す） */
export function EventSeriesLabel({ event, className }: { event: Pick<CalendarEventItem, 'series'>; className?: string }) {
  if (!event.series) return null;
  return <p className={cn('truncate text-xs text-ink-muted', className)}>{event.series.title}</p>;
}

/** 担当コーチ（未設定なら出さない） */
export function EventCoachLine({ event, className }: { event: Pick<CalendarEventItem, 'coaches'>; className?: string }) {
  const names = formatEventCoachNames(event);
  if (!names) return null;
  return (
    <p className={cn('flex items-center gap-1 text-xs text-ink-muted', className)}>
      <UserRound size={12} className="shrink-0" />
      <span className="truncate">コーチ：{names}</span>
    </p>
  );
}
