'use client';

import { useMemo, useState } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  format,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { useMonthNavigator } from '@gabby/lib/hooks/useMonthNavigator';
import { useServerSyncedState } from '@gabby/lib/hooks/useServerSyncedState';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { SessionListItem } from '@gabby/types/session';
import { CalendarEventItem, CALENDAR_EVENT_TYPES, withParticipation } from '@gabby/types/calendarEvent';
import { CalendarItem, getCalendarItemKey } from '@gabby/types/calendarItem';
import { getSessionStatusBadge } from '@/constants/session';
import { SessionActionDialog, SessionActionTarget } from './SessionActionDialog';
import { DayDetailDrawer } from './DayDetailDrawer';
import { useHighlightedDate } from './CalendarWorkspace';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE_CHIPS = 2;

function getChipInfo(item: CalendarItem): { label: string; className: string } {
  if (item.kind === 'session') {
    return { label: item.data.counterpart_name, className: getSessionStatusBadge(item.data).className };
  }
  return { label: item.data.title, className: CALENDAR_EVENT_TYPES[item.data.event_type].badgeClass };
}

/**
 * 終了時刻(終了時刻を持たないお知らせ系イベントは開始時刻)が既に過ぎているかどうか。
 * status上は"Scheduled"のまま(結果未入力)でも実際は終了済みのケースがあるため、
 * ステータス色だけに頼らず時刻で過去判定する。
 */
function isItemPast(item: CalendarItem): boolean {
  const cutoff = item.kind === 'session' ? item.data.end_datetime : (item.data.end_datetime ?? item.data.start_datetime);
  return new Date(cutoff) < new Date();
}

const EMPTY_SESSIONS: SessionListItem[] = [];
const EMPTY_EVENTS: CalendarEventItem[] = [];

interface CalendarBoardProps {
  /** 表示する月（YYYY-MM）。URL の ?month= で持ち、月の切り替えはページ遷移で行う */
  month: string;
  /** サーバーで取得した月のセッション・イベント。null は読み込み中（日付の枠だけを描き、予定は出さない） */
  initialSessions: SessionListItem[] | null;
  initialEvents: CalendarEventItem[] | null;
}

/**
 * 月表示のカレンダー。月のデータはサーバーで取得して渡す（ブラウザからの後追い取得はしない）。
 * 読み込み中も同じ大きさの日付の枠を描き、月の切り替えで高さが変わらないようにする。
 */
export function CalendarBoard({ month, initialSessions, initialEvents }: CalendarBoardProps) {
  const timezone = useTimezone();
  const highlightedDate = useHighlightedDate();
  const isLoading = initialSessions === null || initialEvents === null;
  const [year, monthNo] = month.split('-').map(Number);
  const currentMonth = new Date(year, monthNo - 1, 1);
  const monthNavigator = useMonthNavigator({ targetMonth: month, basePath: '/calendar' });
  // 画面内の操作（キャンセル・参加表明）は即時に反映し、サーバーから新しいデータが届いたら置き換える
  const [sessions, setSessions] = useServerSyncedState(initialSessions ?? EMPTY_SESSIONS);
  const [events, setEvents] = useServerSyncedState(initialEvents ?? EMPTY_EVENTS);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<SessionActionTarget | null>(null);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const s of sessions) {
      const key = toIsoDateInZone(s.start_datetime, timezone);
      const list = map.get(key) ?? [];
      list.push({ kind: 'session', date: key, data: s });
      map.set(key, list);
    }
    for (const e of events) {
      const key = toIsoDateInZone(e.start_datetime, timezone);
      const list = map.get(key) ?? [];
      list.push({ kind: 'calendar_event', date: key, data: e });
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.data.start_datetime.localeCompare(b.data.start_datetime));
    }
    return map;
  }, [sessions, events, timezone]);

  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 }),
  });

  // コーチのタイムゾーンでの「今日」（ブラウザのローカル時刻ではなく、コーチ本人のタイムゾーン基準で判定する）
  const todayKey = toIsoDateInZone(new Date(), timezone);

  const handleResolved = (sessionId: string, patch: Partial<SessionListItem>) => {
    setSessions((prev) => prev.map((s) => (s.session_id === sessionId ? { ...s, ...patch } : s)));
  };

  const handleParticipationChanged = (calendarEventId: string, isJoined: boolean) => {
    setEvents((prev) => prev.map((e) => (e.calendar_event_id === calendarEventId ? withParticipation(e, isJoined) : e)));
  };

  const selectedItems = selectedDate ? itemsByDate.get(selectedDate) ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => monthNavigator.handleMonthChange('prev')}
            disabled={monthNavigator.isPending}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <p className="flex items-center gap-1.5 text-sm font-black text-slate-800">
            {format(currentMonth, 'MMMM yyyy')}
            {monthNavigator.isPending && <Loader2 size={14} className="animate-spin text-slate-400" aria-label="Loading" />}
          </p>
          <button
            type="button"
            onClick={() => monthNavigator.handleMonthChange('next')}
            disabled={monthNavigator.isPending}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400 uppercase mb-1">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1" aria-busy={isLoading}>
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayItems = itemsByDate.get(key) ?? [];
            const isSelected = key === selectedDate;
            const isHighlighted = !isSelected && key === highlightedDate;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(key)}
                disabled={isLoading}
                className={cn(
                  'min-h-16 sm:min-h-19 rounded-lg flex flex-col items-stretch p-1 gap-0.5 text-left transition-colors relative',
                  !isSameMonth(day, currentMonth) && 'opacity-40',
                  isSelected ? 'bg-brand-50 ring-2 ring-brand-500' : 'hover:bg-slate-100',
                  isHighlighted && 'bg-amber-50 ring-2 ring-amber-400'
                )}
              >
                <div className="flex justify-center px-0.5">
                  <span
                    className={cn(
                      'flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold',
                      key === todayKey
                        ? 'bg-brand text-white'
                        : isSameMonth(day, currentMonth) && key >= todayKey
                          ? 'text-slate-700'
                          : 'text-slate-400'
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>
                <div className="space-y-0.5 min-w-0">
                  {dayItems.slice(0, MAX_VISIBLE_CHIPS).map((item) => {
                    const chip = getChipInfo(item);
                    return (
                      <span
                        key={getCalendarItemKey(item)}
                        className={cn(
                          'block text-[8px] font-bold px-1 py-0.5 rounded border truncate leading-tight',
                          chip.className,
                          isItemPast(item) && 'grayscale opacity-60'
                        )}
                      >
                        {chip.label}
                      </span>
                    );
                  })}
                  {dayItems.length > MAX_VISIBLE_CHIPS && (
                    <span className="block text-[8px] font-bold text-slate-400 px-1">+{dayItems.length - MAX_VISIBLE_CHIPS} more</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <DayDetailDrawer
        date={selectedDate}
        items={selectedItems}
        timezone={timezone}
        onClose={() => setSelectedDate(null)}
        onActionRequested={setActionTarget}
        onParticipationChanged={handleParticipationChanged}
      />

      <SessionActionDialog target={actionTarget} onClose={() => setActionTarget(null)} onResolved={handleResolved} />
    </div>
  );
}
