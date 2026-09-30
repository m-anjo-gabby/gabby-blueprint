import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { TrainingMetricIcon } from '@/components/common/TrainingMetricIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { WEEKDAY_LABELS } from '../_lib/weeklyActivity';
import { HOME_LAYOUT, HomeCard } from './HomeCard';
import { TrainingMenuCard } from './TrainingMenuCard';

/*
 * ホーム画面の骨組み。各カードの見出し・曜日などデータに依存しない部分は本物を描き、数値や文言だけを骨組みにする。
 * 画面遷移中（loading.tsx）と、HomeView が現在時刻の確定を待つ間（初回表示）の両方で同じ部品を使い、
 * 骨組み→本番の切り替えで形がずれないようにする。各カードの構成を変えたら対応する骨組みも合わせて直す。
 */

/** 日付行（text-sm）とあいさつ（text-2xl）の骨組み */
export function HomeHeaderSkeleton() {
  return (
    <header className={HOME_LAYOUT.header}>
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-28" />
      </div>
      <div className="flex h-8 items-center">
        <Skeleton className="h-6 w-64 max-w-full" />
      </div>
    </header>
  );
}

/** ブランド面の上に置く骨組みの棒（通常の骨組みの色は濃い面では沈むため、白の半透明にする） */
function HeroBar({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-white/15', className)} />;
}

/** 主役カード「今日やること」の骨組み（面は本番と同じブランドのグラデーション） */
export function TodayFocusCardSkeleton() {
  return (
    <section aria-hidden className="relative flex h-full flex-col overflow-hidden rounded-card bg-brand-hero p-6 sm:p-8 shadow-md shadow-brand/15">
      <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="flex h-4 items-center">
        <HeroBar className="h-3 w-28" />
      </div>
      <div className="mt-2 flex h-7 items-center sm:h-8">
        <HeroBar className="h-5 w-3/4 sm:h-6" />
      </div>
      <div className="mt-2 flex h-5 items-center">
        <HeroBar className="h-3.5 w-1/2" />
      </div>
      <div className="mt-auto pt-6">
        <HeroBar className="h-12 w-40 rounded-control" />
      </div>
    </section>
  );
}

/** 「今週のトレーニング」の骨組み（曜日・発話の見出しは本物） */
export function WeeklyActivityCardSkeleton() {
  return (
    <HomeCard title="今週のトレーニング" action={{ label: '記録を見る', href: '/training/performance' }}>
      <div className="flex h-9 items-center">
        <Skeleton className="h-7 w-36" />
      </div>

      <ol className="mt-4 grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((label) => (
          <li key={label} className="flex flex-col items-center gap-1.5">
            <Skeleton className="size-8 rounded-full" />
            <span className="text-[11px] text-ink-muted">{label}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-sm text-ink-muted">
        <TrainingMetricIcon metric="speech" />
        今週の発話
        <Skeleton className="ml-auto h-4 w-10" />
      </div>
    </HomeCard>
  );
}

/** 「これまでの積み上げ」の骨組み（1列の時は横長3行、2列分の時は縦長3マス） */
export function LifetimeStatsCardSkeleton({ className }: { className?: string }) {
  return (
    <HomeCard title="これまでの積み上げ" className={className}>
      <div className="@container">
        <div className="grid gap-2 @md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-13 rounded-control @md:h-34" />
          ))}
        </div>
      </div>
    </HomeCard>
  );
}

/**
 * ホーム画面の読み込み中表示（loading.tsx 用）。
 * 次回のセッションの有無はデータが届くまで分からないため、最も多い「次回のセッションなし」の並び
 * （1行目: 今日やること＋今週 / 2行目: 積み上げ2列分＋メニュー）で描く。
 */
export function HomeSkeleton() {
  return (
    <RouteSkeleton className={HOME_LAYOUT.page}>
      <HomeHeaderSkeleton />
      <div className={HOME_LAYOUT.grid}>
        <div className={HOME_LAYOUT.focus}>
          <TodayFocusCardSkeleton />
        </div>
        <WeeklyActivityCardSkeleton />
        <LifetimeStatsCardSkeleton className="lg:col-span-2" />
        <TrainingMenuCard />
      </div>
    </RouteSkeleton>
  );
}
