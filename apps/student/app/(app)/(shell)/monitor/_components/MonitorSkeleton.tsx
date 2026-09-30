'use client';

import { useSearchParams } from 'next/navigation';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { Skeleton } from '@/components/ui/skeleton';
import { MONITOR_PAGE_CLASS, MonitorHeader, MonitorToggleSkeleton, type MonitorViewType } from './MonitorHeader';

const VIEWS: MonitorViewType[] = ['overview', 'word', 'sprint'];
const ROW_COUNT = 8;

/**
 * モニタリングダッシュボードの読み込み中表示（loading.tsx 用）。
 * 見出しとタブ（表示中のタブは URL の view）は本物を描き、条件パネルと一覧を骨組みにする。
 */
export function MonitorSkeleton() {
  const searchParams = useSearchParams();
  const view = VIEWS.find((v) => v === searchParams.get('view')) ?? 'overview';

  return (
    <RouteSkeleton className={MONITOR_PAGE_CLASS}>
      <MonitorHeader
        view={view}
        userIds={searchParams.get('userIds') ?? undefined}
        startDate={searchParams.get('startDate') ?? undefined}
        endDate={searchParams.get('endDate') ?? undefined}
        includeMonitor={searchParams.get('includeMonitor') === 'true'}
        toggle={<MonitorToggleSkeleton />}
      />

      <div aria-hidden className="min-h-100 space-y-4">
        {/* 条件パネル（期間・受講生の絞り込み・CSV出力） */}
        <div className="flex flex-col gap-4 rounded-2xl border border-line/60 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-56 rounded-xl" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>

        {/* 一覧 */}
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          {Array.from({ length: ROW_COUNT }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg opacity-70" />
          ))}
        </div>
      </div>
    </RouteSkeleton>
  );
}
