'use client';

import { AudioLines, Search, X } from 'lucide-react';
import { type DayOfWeek, DAYS_OF_WEEK } from '@gabby/types/coachAvailability';
import { type CoachSpecialtyMaster } from '@gabby/types/coachSpecialty';
import { Skeleton } from '@/components/ui/skeleton';
import { DAY_OF_WEEK_LABEL_JA, TIME_BUCKETS } from '@/constants/matching';
import { cn } from '@/lib/utils';

interface CoachSearchFiltersProps {
  selectedDays: Set<DayOfWeek>;
  onToggleDay: (day: DayOfWeek) => void;
  selectedTimeBuckets: Set<string>;
  onToggleTimeBucket: (key: string) => void;
  /** 専門の選択肢（null は読み込み中。骨組みで描く） */
  specialties: CoachSpecialtyMaster[] | null;
  selectedSpecialties: Set<string>;
  onToggleSpecialty: (code: string) => void;
  nameQuery: string;
  onChangeNameQuery: (value: string) => void;
  onClear: () => void;
  hasFilter: boolean;
}

/** 専門の骨組みの数（マスタの初期の項目数に合わせ、読み込み後に段の高さが変わりにくくする） */
const SPECIALTY_SKELETON_COUNT = 9;

/**
 * コーチ検索フィルター：コーチ名（部分一致）、曜日（複数選択）、大まかな時間帯（複数選択）、専門（複数選択）で絞り込む。
 * 専門の分野はどれかに当てはまるコーチ、発音プロ（得意分野）は選ぶと該当するコーチだけに絞る。
 */
export function CoachSearchFilters({
  selectedDays,
  onToggleDay,
  selectedTimeBuckets,
  onToggleTimeBucket,
  specialties,
  selectedSpecialties,
  onToggleSpecialty,
  nameQuery,
  onChangeNameQuery,
  onClear,
  hasFilter,
}: CoachSearchFiltersProps) {
  return (
    <div className="bg-surface rounded-card border border-line/70 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-ink-subtle">コーチ名・曜日・時間帯・専門で絞り込み</p>
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
          className="w-full h-10 rounded-control border border-line/70 bg-canvas pl-9 pr-3 text-sm text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-200"
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
              'w-9 h-9 rounded-control text-xs font-bold transition-colors border',
              selectedDays.has(day)
                ? 'bg-brand border-brand text-white'
                : 'bg-canvas border-line/70 text-ink-muted hover:bg-brand-soft',
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
              'h-9 px-3 rounded-control text-xs font-bold transition-colors border',
              selectedTimeBuckets.has(bucket.key)
                ? 'bg-brand border-brand text-white'
                : 'bg-canvas border-line/70 text-ink-muted hover:bg-brand-soft',
            )}
          >
            {bucket.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {specialties === null
          ? Array.from({ length: SPECIALTY_SKELETON_COUNT }, (_, i) => (
              <Skeleton key={i} className="h-9 w-20 rounded-control" />
            ))
          : specialties.map((specialty) => {
              const selected = selectedSpecialties.has(specialty.specialty_code);
              return (
                <button
                  key={specialty.specialty_code}
                  type="button"
                  onClick={() => onToggleSpecialty(specialty.specialty_code)}
                  aria-pressed={selected}
                  className={cn(
                    'inline-flex items-center gap-1 h-9 px-3 rounded-control text-xs font-bold transition-colors border',
                    selected
                      ? 'bg-brand border-brand text-white'
                      : 'bg-canvas border-line/70 text-ink-muted hover:bg-brand-soft',
                  )}
                >
                  {specialty.kind === 'skill' && <AudioLines size={13} aria-hidden />}
                  {specialty.name_ja}
                </button>
              );
            })}
      </div>
    </div>
  );
}
