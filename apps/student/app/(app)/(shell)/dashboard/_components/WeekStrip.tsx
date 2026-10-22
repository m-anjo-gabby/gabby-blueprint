import { Check, ChevronRight, Flame } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { WEEKDAY_LABELS, type WeekDay } from '../_lib/weeklyActivity';

/** 今週の帯に出す実績（現在時刻の確定前は null で骨組みにする） */
export interface WeekSummary {
  days: WeekDay[];
  activeCount: number;
  /** 表示用の連続日数（途切れている場合は 0） */
  streakDays: number;
}

/** 連続日数を表示する下限（1日だけでは「連続」と言わない。途切れたことは表示しない） */
const STREAK_DISPLAY_MIN_DAYS = 2;

/**
 * 今週の帯の外形（本番と骨組みで共有する）。主役カードのブランド面の上に置き、
 * PC(lg以上)は見出しの右に幅を決めて、それより狭い画面は見出しの下に全幅で出す
 */
const STRIP_CLASS = 'relative w-full shrink-0 rounded-control border border-white/15 bg-white/10 px-4 py-3 lg:w-80';

function StripHeading() {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold text-brand-100">今週のトレーニング</p>
      <Link
        href="/training/performance"
        className="inline-flex items-center gap-0.5 text-xs font-semibold text-white hover:text-brand-100 transition-colors"
      >
        記録を見る
        <ChevronRight size={14} />
      </Link>
    </div>
  );
}

/**
 * 今週(月〜日)のトレーニング日数・日ごとの実施有無と、継続中の連続日数。
 * 今日のメニューと「今週続けているか」を1か所で見せるため、単独のカードにせず主役カードの見出しに添える
 */
export function WeekStrip({ week }: { week: WeekSummary | null }) {
  if (!week) return <WeekStripSkeleton />;
  return (
    <div className={STRIP_CLASS}>
      <StripHeading />
      <div className="mt-1 flex h-7 items-center justify-between gap-2">
        <p>
          <span className="text-xl font-bold tabular-nums">{week.activeCount}</span>
          <span className="ml-1 text-xs font-semibold text-white/85">日 実施しました</span>
        </p>
        {week.streakDays >= STREAK_DISPLAY_MIN_DAYS && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-brand">
            <Flame size={14} />
            {week.streakDays}日連続
          </span>
        )}
      </div>
      <ol className="mt-2 grid grid-cols-7 gap-1">
        {week.days.map((day) => (
          <li key={day.isoDate} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-full',
                day.isActive
                  ? 'bg-white text-brand'
                  : day.isFuture
                    ? 'border border-dashed border-white/35'
                    : 'bg-white/15',
                day.isToday && !day.isActive && 'ring-2 ring-white/70',
              )}
              aria-label={`${day.label}曜日${day.isActive ? '：トレーニング済み' : ''}`}
            >
              {day.isActive && <Check size={13} strokeWidth={3} />}
            </span>
            <span className={cn('text-[11px]', day.isToday ? 'font-bold text-white' : 'text-brand-100')}>
              {day.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 今週の帯の骨組み（見出し・リンク・曜日は本物、日数と各日の印だけを骨組みにする） */
export function WeekStripSkeleton() {
  return (
    <div className={STRIP_CLASS}>
      <StripHeading />
      <div className="mt-1 flex h-7 items-center">
        <div aria-hidden className="h-5 w-28 animate-pulse rounded-md bg-white/15" />
      </div>
      <ol aria-hidden className="mt-2 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <li key={label} className="flex flex-col items-center gap-1">
            <span className="size-7 animate-pulse rounded-full bg-white/15" />
            <span className="text-[11px] text-brand-100">{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
