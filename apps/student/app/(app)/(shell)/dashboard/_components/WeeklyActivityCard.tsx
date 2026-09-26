import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WeekDay } from '../_lib/weeklyActivity';
import { HomeCard } from './HomeCard';

interface WeeklyActivityCardProps {
  days: WeekDay[];
  activeCount: number;
}

/** 今週(月〜日)のトレーニング日数と、日ごとの実施有無 */
export function WeeklyActivityCard({ days, activeCount }: WeeklyActivityCardProps) {
  return (
    <HomeCard title="今週のトレーニング" action={{ label: '記録を見る', href: '/training/performance' }}>
      <p className="text-ink">
        <span className="text-3xl font-bold tracking-tight">{activeCount}</span>
        <span className="ml-1 text-sm font-semibold text-ink-muted">日 実施しました</span>
      </p>

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
    </HomeCard>
  );
}
