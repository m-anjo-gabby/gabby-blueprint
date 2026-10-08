'use client';

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfToday,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isBefore,
  format,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CALENDAR_EVENT_TYPES } from '@gabby/types/calendarEvent';
import { type CalendarItem, getCalendarItemKey } from '@gabby/types/calendarItem';
import { getSessionStatusBadge } from '@/constants/session';

const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];
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

interface CalendarMonthCardProps {
  currentMonth: Date;
  /** 日付ごとの予定。null は読み込み中（日付の枠は描き、予定のチップだけを出さない。日付は選べない） */
  itemsByDate: Map<string, CalendarItem[]> | null;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
  /** 月の切り替え中（前月・翌月の矢印を押せなくする） */
  isPending?: boolean;
}

/**
 * 月表示のカレンダー（月切替・曜日・日付ごとの予定のチップ）。
 * 読み込み中も日付の枠は同じ大きさで描き、月切替や画面遷移で高さが変わらないようにする
 * （画面遷移中の CalendarSkeleton と共有する）。
 */
export function CalendarMonthCard({ currentMonth, itemsByDate, selectedDate, onSelectDate, onPrev, onNext, isPending = false }: CalendarMonthCardProps) {
  const isLoading = itemsByDate === null;
  const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start, end });

  return (
    <div className="bg-white rounded-card border border-line/70 shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={isPending}
          className="p-1.5 rounded-lg hover:bg-canvas text-ink-muted disabled:pointer-events-none disabled:opacity-40"
          aria-label="前の月"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-bold text-ink">{format(currentMonth, 'yyyy年M月')}</p>
        <button
          type="button"
          onClick={onNext}
          disabled={isPending}
          className="p-1.5 rounded-lg hover:bg-canvas text-ink-muted disabled:pointer-events-none disabled:opacity-40"
          aria-label="次の月"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-ink-subtle mb-1">
        {WEEKDAY_LABELS_JA.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayItems = itemsByDate?.get(key) ?? [];
          const isSelected = key === selectedDate;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              disabled={isLoading}
              className={cn(
                'min-h-16 sm:min-h-19 rounded-lg flex flex-col items-stretch p-1 gap-0.5 text-left transition-colors relative',
                !isSameMonth(day, currentMonth) && 'opacity-40',
                isSelected ? 'bg-brand-soft ring-2 ring-brand-500' : 'hover:bg-canvas'
              )}
            >
              <div className="flex justify-center px-0.5">
                <span
                  className={cn(
                    'flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold',
                    isToday(day)
                      ? 'bg-brand text-white'
                      : isSameMonth(day, currentMonth) && !isBefore(day, startOfToday())
                        ? 'text-ink-soft'
                        : 'text-ink-subtle'
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
                        'block text-[11px] font-bold px-1 py-0.5 rounded border truncate leading-tight',
                        chip.className,
                        isItemPast(item) && 'grayscale opacity-60'
                      )}
                    >
                      {chip.label}
                    </span>
                  );
                })}
                {dayItems.length > MAX_VISIBLE_CHIPS && (
                  <span className="block text-[11px] font-bold text-ink-subtle px-1">他{dayItems.length - MAX_VISIBLE_CHIPS}件</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
