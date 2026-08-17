'use client';

import { X } from 'lucide-react';
import { DayOfWeek, DAYS_OF_WEEK } from '@gabby/types/coachAvailability';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';
import { cn } from '@/lib/utils';

interface CoachSearchFiltersProps {
  selectedDays: Set<DayOfWeek>;
  onToggleDay: (day: DayOfWeek) => void;
  startTime: string;
  endTime: string;
  onChangeStartTime: (value: string) => void;
  onChangeEndTime: (value: string) => void;
  onClear: () => void;
  hasFilter: boolean;
}

/** コーチ検索フィルター：曜日（複数選択）と時刻範囲でコーチの対応可能時間を絞り込む */
export function CoachSearchFilters({
  selectedDays,
  onToggleDay,
  startTime,
  endTime,
  onChangeStartTime,
  onChangeEndTime,
  onClear,
  hasFilter,
}: CoachSearchFiltersProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">曜日・時間帯で絞り込み</p>
        {hasFilter && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors"
          >
            <X size={12} /> リセット
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DAYS_OF_WEEK.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => onToggleDay(day)}
            aria-pressed={selectedDays.has(day)}
            className={cn(
              'w-9 h-9 rounded-xl text-xs font-black transition-colors border',
              selectedDays.has(day)
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-indigo-50'
            )}
          >
            {DAY_OF_WEEK_LABEL_JA[day].slice(0, 1)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="time"
          value={startTime}
          onChange={(e) => onChangeStartTime(e.target.value)}
          className="flex-1 min-w-0 h-10 rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-200"
        />
        <span className="text-xs text-slate-400 font-bold shrink-0">〜</span>
        <input
          type="time"
          value={endTime}
          onChange={(e) => onChangeEndTime(e.target.value)}
          className="flex-1 min-w-0 h-10 rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-200"
        />
      </div>
    </div>
  );
}
