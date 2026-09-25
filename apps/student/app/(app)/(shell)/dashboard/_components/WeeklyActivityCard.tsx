import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WeekDay } from '../_lib/weeklyActivity';
import { HomeCard } from './HomeCard';

interface WeeklyActivityCardProps {
  days: WeekDay[];
  activeCount: number;
}

/** 今週(月〜日)の学習日数と、日ごとの学習有無 */
export function WeeklyActivityCard({ days, activeCount }: WeeklyActivityCardProps) {
  return (
    <HomeCard title="今週の学習" action={{ label: '学習記録', href: '/training/performance' }}>
      <p className="text-slate-900">
        <span className="text-3xl font-bold tracking-tight">{activeCount}</span>
        <span className="ml-1 text-sm font-semibold text-slate-500">日 学習しました</span>
      </p>

      <ol className="mt-4 grid grid-cols-7 gap-1.5">
        {days.map((day) => (
          <li key={day.isoDate} className="flex flex-col items-center gap-1.5">
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors',
                day.isActive
                  ? 'bg-indigo-600 text-white'
                  : day.isFuture
                    ? 'border border-dashed border-slate-200 text-transparent'
                    : 'bg-slate-100 text-transparent',
                day.isToday && 'ring-2 ring-indigo-200 ring-offset-2'
              )}
              aria-label={`${day.label}曜日${day.isActive ? '：学習済み' : ''}`}
            >
              {day.isActive && <Check size={14} strokeWidth={3} />}
            </span>
            <span className={cn('text-[11px]', day.isToday ? 'font-bold text-indigo-700' : 'text-slate-500')}>
              {day.label}
            </span>
          </li>
        ))}
      </ol>
    </HomeCard>
  );
}
