'use client';

import { ShellPageHeader, ShellSectionTitle } from '@/components/shell/ShellPage';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { Skeleton } from '@/components/ui/skeleton';
import type { DayOfWeek } from '@gabby/types/coachAvailability';
import { CoachSearchFilters } from './CoachSearchFilters';

const SLOT_SKELETON_COUNT = 2;
const COACH_SKELETON_COUNT = 4;

const noop = () => {};
const NO_DAYS = new Set<DayOfWeek>();
const NO_TIME_BUCKETS = new Set<string>();

/**
 * 画面の見出し（CoachMatchingView・page.tsx・骨組みで共有する）。
 * weeklyFrequency: 数値なら説明文を出す、null は読み込み中（説明文を骨組みにする）、省略時は説明文なし（対象外の生徒）
 */
export function CoachMatchingPageHeader({ weeklyFrequency }: { weeklyFrequency?: number | null }) {
  const description =
    weeklyFrequency === undefined ? undefined : weeklyFrequency === null ? (
      <span aria-hidden className="block space-y-1.5 pt-0.5">
        <span className="block h-3.5 w-full animate-pulse rounded-md bg-skeleton" />
        <span className="block h-3.5 w-2/3 animate-pulse rounded-md bg-skeleton" />
      </span>
    ) : (
      `週${weeklyFrequency}回のセッション枠ごとにコーチをリクエストできます。コーチが承認すると、契約期間分のセッションが自動で予約されます。`
    );
  return <ShellPageHeader title="専属コーチを探す" back="/live-room" description={description} />;
}

/** CoachCard（アイコン・名前・国/指導歴、紹介文、対応可能時間のチップ）と同じ枠・行の高さの骨組み */
function CoachCardSkeleton() {
  return (
    <div aria-hidden className="flex h-full flex-col gap-3 rounded-card border border-line/70 bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 shrink-0 rounded-control" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="size-8 shrink-0 rounded-full sm:w-24" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-6.5 w-20 rounded-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * 専属コーチを探す画面の読み込み中表示（loading.tsx 用）。
 * 見出し・区画見出し・絞り込み欄は本物を描き、説明文（週の回数）・セッション枠・コーチのカードを骨組みにする。
 */
export function CoachMatchingSkeleton() {
  return (
    <RouteSkeleton>
      <CoachMatchingPageHeader weeklyFrequency={null} />
      <div className="space-y-6">
        <section>
          <ShellSectionTitle>セッション枠の状況</ShellSectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: SLOT_SKELETON_COUNT }, (_, i) => (
              <div key={i} aria-hidden className="space-y-2 rounded-card border border-line/70 bg-surface p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        </section>

        <section>
          <ShellSectionTitle>コーチを選ぶ</ShellSectionTitle>
          <div className="space-y-3">
            <CoachSearchFilters
              selectedDays={NO_DAYS}
              onToggleDay={noop}
              selectedTimeBuckets={NO_TIME_BUCKETS}
              onToggleTimeBucket={noop}
              nameQuery=""
              onChangeNameQuery={noop}
              onClear={noop}
              hasFilter={false}
            />
            <div className="flex h-6 items-center justify-between px-1 pt-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3.5 w-10" />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {Array.from({ length: COACH_SKELETON_COUNT }, (_, i) => (
                <CoachCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </RouteSkeleton>
  );
}
