'use client';

import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { useShellNavContext } from '@/components/shell/ShellNavContext';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { HeroBackdrop, HOME_LAYOUT, HomeCard } from './HomeCard';
import { HomeEventCardSkeleton } from './HomeEventCard';
import { LIFETIME_ITEMS, LIFETIME_LAYOUT, LifetimeBlock } from './LifetimeStatsCard';
import { LiveSessionCardSkeleton } from './LiveSessionCard';
import { PlanCardSkeleton } from './PlanCard';
import { TODAY_MENU_LAYOUT } from './TodayMenuCard';
import { WeekStripSkeleton } from './WeekStrip';

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

/**
 * 主役カード「今日のトレーニングメニュー」の骨組み（面・今週の帯の見出し・曜日は本物。やることは標準メニューの
 * スプリント2件・ビデオ2件の2列）。メニューを出さない環境（menuEnabled=false）では、教材・お気に入りへの案内の形
 * （見出し・案内文・ボタン2つ）にする。
 */
export function TodayMenuCardSkeleton({ menuEnabled }: { menuEnabled: boolean }) {
  return (
    <section aria-hidden className={TODAY_MENU_LAYOUT.frame}>
      <HeroBackdrop />
      <div className={TODAY_MENU_LAYOUT.header}>
        <div className={TODAY_MENU_LAYOUT.heading}>
          <div className="flex h-4 items-center">
            <HeroBar className="h-3 w-40" />
          </div>
          <div className="mt-2 flex h-7 items-center sm:h-8">
            <HeroBar className="h-5 w-3/4 sm:h-6" />
          </div>
          {menuEnabled ? (
            <div className={TODAY_MENU_LAYOUT.progress}>
              <div className="flex h-11 items-center">
                <HeroBar className="h-1 w-full rounded-full" />
              </div>
            </div>
          ) : (
            <div className="mt-2 flex h-5 items-center">
              <HeroBar className="h-3.5 w-full max-w-md" />
            </div>
          )}
        </div>
        <WeekStripSkeleton />
      </div>
      {menuEnabled ? (
        <>
          <div className={TODAY_MENU_LAYOUT.groups(2)}>
            {[0, 1].map((group) => (
              <div key={group} className="min-w-0">
                <div className="mb-2 flex h-4 items-center">
                  <HeroBar className="h-3 w-16" />
                </div>
                <div className={TODAY_MENU_LAYOUT.items(2)}>
                  {[0, 1].map((i) => (
                    <HeroBar key={i} className="h-17.5 w-full rounded-control" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className={TODAY_MENU_LAYOUT.actions}>
            <HeroBar className="h-12 w-40 rounded-control" />
          </div>
        </>
      ) : (
        <div className={TODAY_MENU_LAYOUT.actions}>
          <HeroBar className="h-12 w-36 rounded-control" />
          <HeroBar className="h-12 w-36 rounded-control" />
        </div>
      )}
    </section>
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
 * 今日のトレーニングメニュー（今週の帯を含む） / ライブセッション（ライブセッション付きの契約がある場合だけ、1行） / グループセッション（1行） / 歩み2列分＋ご契約プラン。
 * ライブセッションの有無と主役のカードの形はシェルのナビと同じ判定（ShellNavProvider）で、外側の読み込み中から本番と同じ並びにする。
 */
export function HomeSkeleton() {
  const { hasLiveSession, trainingMenuEnabled } = useShellNavContext();
  return (
    <RouteSkeleton className={HOME_LAYOUT.page}>
      <HomeHeaderSkeleton />
      <div className={HOME_LAYOUT.grid}>
        <div className={HOME_LAYOUT.fullRow}>
          <TodayMenuCardSkeleton menuEnabled={trainingMenuEnabled} />
        </div>
        {hasLiveSession && (
          <div className={HOME_LAYOUT.fullRow}>
            <LiveSessionCardSkeleton />
          </div>
        )}
        <div className={HOME_LAYOUT.fullRow}>
          <HomeEventCardSkeleton />
        </div>
        <LifetimeStatsCardSkeleton className={HOME_LAYOUT.wide} />
        <PlanCardSkeleton />
      </div>
    </RouteSkeleton>
  );
}
