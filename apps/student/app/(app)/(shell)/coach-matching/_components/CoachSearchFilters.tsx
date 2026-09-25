'use client';

import { Search, X } from 'lucide-react';
import { DayOfWeek, DAYS_OF_WEEK } from '@gabby/types/coachAvailability';
import { DAY_OF_WEEK_LABEL_JA, TIME_BUCKETS } from '@/constants/matching';
import { cn } from '@/lib/utils';

interface CoachSearchFiltersProps {
  selectedDays: Set<DayOfWeek>;
  onToggleDay: (day: DayOfWeek) => void;
  selectedTimeBuckets: Set<string>;
  onToggleTimeBucket: (key: string) => void;
  nameQuery: string;
  onChangeNameQuery: (value: string) => void;
  onClear: () => void;
  hasFilter: boolean;
}

/** コーチ検索フィルター：コーチ名（部分一致）、曜日（複数選択）、大まかな時間帯（複数選択）で絞り込む */
export function CoachSearchFilters({
  selectedDays,
  onToggleDay,
  selectedTimeBuckets,
  onToggleTimeBucket,
  nameQuery,
  onChangeNameQuery,
  onClear,
  hasFilter,
}: CoachSearchFiltersProps) {
  return (
    <div className="bg-white rounded-2xl border border-line/70 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-ink-subtle uppercase">コーチ名・曜日・時間帯で絞り込み</p>
        {hasFilter && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-subtle hover:text-rose-600 transition-colors"
          >
            <X size={12} /> リセット
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <input
          type="text"
          value={nameQuery}
          onChange={(e) => onChangeNameQuery(e.target.value)}
          placeholder="コーチ名で検索"
          className="w-full h-10 rounded-xl border border-line/70 bg-slate-50 pl-9 pr-3 text-sm text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-200"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DAYS_OF_WEEK.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => onToggleDay(day)}
            aria-pressed={selectedDays.has(day)}
            className={cn(
              'w-9 h-9 rounded-xl text-xs font-bold transition-colors border',
              selectedDays.has(day)
                ? 'bg-brand border-brand text-white'
                : 'bg-slate-50 border-line/70 text-ink-muted hover:bg-brand-soft'
            )}
          >
            {DAY_OF_WEEK_LABEL_JA[day].slice(0, 1)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TIME_BUCKETS.map((bucket) => (
          <button
            key={bucket.key}
            type="button"
            onClick={() => onToggleTimeBucket(bucket.key)}
            aria-pressed={selectedTimeBuckets.has(bucket.key)}
            className={cn(
              'h-9 px-3 rounded-xl text-xs font-bold transition-colors border',
              selectedTimeBuckets.has(bucket.key)
                ? 'bg-brand border-brand text-white'
                : 'bg-slate-50 border-line/70 text-ink-muted hover:bg-brand-soft'
            )}
          >
            {bucket.label}
          </button>
        ))}
      </div>
    </div>
  );
}
