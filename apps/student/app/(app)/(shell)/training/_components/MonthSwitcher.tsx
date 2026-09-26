'use client';

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { useMonthNavigator } from '@gabby/lib/hooks/useMonthNavigator';

type MonthSwitcherProps = ReturnType<typeof useMonthNavigator>;

const ARROW_BUTTON_CLASS =
  'flex h-10 w-10 items-center justify-center rounded-control text-ink-muted hover:bg-brand-soft hover:text-brand active:scale-95 transition-all disabled:pointer-events-none disabled:opacity-40';

/** トレーニング記録系画面の月切替（前月・翌月・今月に戻る） */
export function MonthSwitcher({
  currentMonthStr,
  displayYear,
  displayMonth,
  isNotCurrentMonth,
  handleMonthChange,
  goToMonth,
  isPending,
}: MonthSwitcherProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex items-center rounded-control border border-line bg-surface p-0.5">
        <button type="button" onClick={() => handleMonthChange('prev')} disabled={isPending} className={ARROW_BUTTON_CLASS} aria-label="前月">
          <ChevronLeft size={18} />
        </button>
        <div className="flex h-10 min-w-32 items-center justify-center px-2 tabular-nums">
          {isPending ? (
            <Loader2 size={16} className="animate-spin text-brand-500" />
          ) : (
            <span className="text-base font-bold text-ink">
              <span className="mr-1 text-sm font-medium text-ink-muted">{displayYear}年</span>
              {parseInt(displayMonth, 10)}月
            </span>
          )}
        </div>
        <button type="button" onClick={() => handleMonthChange('next')} disabled={isPending} className={ARROW_BUTTON_CLASS} aria-label="翌月">
          <ChevronRight size={18} />
        </button>
      </div>

      {isNotCurrentMonth && (
        <button
          type="button"
          onClick={() => goToMonth(currentMonthStr)}
          disabled={isPending}
          className="h-10 rounded-control px-3 text-sm font-semibold text-brand hover:bg-brand-soft active:scale-95 transition-all disabled:pointer-events-none disabled:opacity-40"
        >
          今月に戻る
        </button>
      )}
    </div>
  );
}
