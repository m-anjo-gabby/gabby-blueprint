import { Check, Flame } from 'lucide-react';
import { TrainingMetricIcon } from '@/components/common/TrainingMetricIcon';
import { cn } from '@/lib/utils';
import type { WeekDay } from '../_lib/weeklyActivity';
import { HomeCard } from './HomeCard';

interface WeeklyActivityCardProps {
  days: WeekDay[];
  activeCount: number;
  /** 今週の発話回数 */
  assessmentCount: number;
  /** 表示用の連続日数（途切れている場合は 0） */
  streakDays: number;
}

/** 連続日数を表示する下限（1日だけでは「連続」と言わない。途切れたことは表示しない） */
const STREAK_DISPLAY_MIN_DAYS = 2;

/** 今週(月〜日)のトレーニング日数・日ごとの実施有無・発話回数と、継続中の連続日数 */
export function WeeklyActivityCard({ days, activeCount, assessmentCount, streakDays }: WeeklyActivityCardProps) {
  return (
    <HomeCard title="今週のトレーニング" action={{ label: '記録を見る', href: '/training/performance' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink">
          <span className="text-3xl font-bold tracking-tight tabular-nums">{activeCount}</span>
          <span className="ml-1 text-sm font-semibold text-ink-muted">日 実施しました</span>
        </p>
        {streakDays >= STREAK_DISPLAY_MIN_DAYS && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand">
            <Flame size={14} />
            {streakDays}日連続
          </span>
        )}
      </div>

      <ol className="mt-4 grid grid-cols-7 gap-1.5">
        {days.map((day) => (
          <li key={day.isoDate} className="flex flex-col items-center gap-1.5">
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors',
                day.isActive
                  ? 'bg-brand text-white'
                  : day.isFuture
                    ? 'border border-dashed border-line text-transparent'
                    : 'bg-slate-100 text-transparent',
                day.isToday && 'ring-2 ring-brand-200 ring-offset-2'
              )}
              aria-label={`${day.label}曜日${day.isActive ? '：トレーニング済み' : ''}`}
            >
              {day.isActive && <Check size={14} strokeWidth={3} />}
            </span>
            <span className={cn('text-[11px]', day.isToday ? 'font-bold text-brand-strong' : 'text-ink-muted')}>
              {day.label}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-sm text-ink-muted">
        <TrainingMetricIcon metric="speech" />
        今週の発話
        <span className="ml-auto font-bold text-ink tabular-nums">
          {assessmentCount}
          <span className="ml-0.5 text-xs font-normal text-ink-muted">回</span>
        </span>
      </p>
    </HomeCard>
  );
}
