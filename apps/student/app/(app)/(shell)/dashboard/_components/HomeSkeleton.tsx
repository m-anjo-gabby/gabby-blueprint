'use client';

import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { useShellNavContext } from '@/components/shell/ShellNavContext';
import { TrainingMetricIcon } from '@/components/common/TrainingMetricIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { WEEKDAY_LABELS } from '../_lib/weeklyActivity';
import { HOME_LAYOUT, HeroBackdrop, HomeCard } from './HomeCard';
import { LIFETIME_ITEMS, LIFETIME_LAYOUT, LifetimeBlock } from './LifetimeStatsCard';
import { LiveSessionCardSkeleton } from './LiveSessionCard';
import { PlanCardSkeleton } from './PlanCard';

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
      <HeroBackdrop />
      <div className="relative flex h-4 items-center">
        <HeroBar className="h-3 w-28" />
      </div>
      <div className="relative mt-2 flex h-7 items-center sm:h-8">
        <HeroBar className="h-5 w-3/4 sm:h-6" />
      </div>
      <div className="relative mt-2 flex h-5 items-center">
        <HeroBar className="h-3.5 w-1/2" />
      </div>
      <div className="relative mt-auto pt-6">
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

/** 「これまでの歩み」の骨組み（項目の枠・見出しは本物、数値・節目の段階表示・案内文だけを同じ高さの骨組みにする） */
export function LifetimeStatsCardSkeleton({ className }: { className?: string }) {
  const { activeDays, assessments } = LIFETIME_ITEMS;
  return (
    <HomeCard title="これまでの歩み" className={className}>
      <div className="@container">
        <div className={LIFETIME_LAYOUT.grid}>
          <LifetimeBlock {...activeDays} className={LIFETIME_LAYOUT.main}>
            <div className="mt-3 flex h-9 items-center">
              <Skeleton className="h-7 w-20" />
            </div>
            <Skeleton className="mt-4 h-9.5 w-full" />
            <div className="mt-3 flex h-4 items-center">
              <Skeleton className="h-3 w-36" />
            </div>
          </LifetimeBlock>
          <LifetimeBlock {...assessments} className={LIFETIME_LAYOUT.sub}>
            <div className="mt-3 flex h-9 items-center">
              <Skeleton className="h-7 w-20" />
            </div>
            <p className="text-xs text-ink-muted">{assessments.caption}</p>
            <div className="mt-auto space-y-1.5 pt-4">
              <Skeleton className="h-1 w-full" />
              <div className="flex h-4 items-center">
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </LifetimeBlock>
        </div>
      </div>
    </HomeCard>
  );
}

/**
 * ホーム画面の読み込み中表示（loading.tsx 用）。
 * 1行目: 今日やること＋今週 / 2行目: ライブセッション（ライブセッション付きの契約がある場合だけ） / 3行目: 歩み2列分＋ご契約プラン。
 * ライブセッションの有無はシェルのナビと同じ判定（ShellNavProvider）で、外側の読み込み中から本番と同じ並びにする。
 */
export function HomeSkeleton() {
  const { hasLiveSession } = useShellNavContext();
  return (
    <RouteSkeleton className={HOME_LAYOUT.page}>
      <HomeHeaderSkeleton />
      <div className={HOME_LAYOUT.grid}>
        <div className={HOME_LAYOUT.focus}>
          <TodayFocusCardSkeleton />
        </div>
        <WeeklyActivityCardSkeleton />
        {hasLiveSession && (
          <div className={HOME_LAYOUT.fullRow}>
            <LiveSessionCardSkeleton />
          </div>
        )}
        <LifetimeStatsCardSkeleton className={HOME_LAYOUT.wide} />
        <PlanCardSkeleton />
      </div>
    </RouteSkeleton>
  );
}
