'use client';

import { useSearchParams } from 'next/navigation';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { Skeleton } from '@/components/ui/skeleton';
import { MonitorHeader } from './MonitorHeader';
import { MonitorDayListSkeleton } from './MonitorParts';
import { parseMonitorView } from './monitorQuery';

const USER_ROW_COUNT = 6;

/**
 * モニタリングダッシュボードの読み込み中表示（loading.tsx 用）。
 * 見出し・タブ・モニター切替（表示中の条件は URL から）は本物を描き、表示中のタブの条件欄と一覧を骨組みにする。
 */
export function MonitorSkeleton() {
  const searchParams = useSearchParams();
  const view = parseMonitorView(searchParams.get('view'));

  return (
    <RouteSkeleton>
      <MonitorHeader
        query={{
          view,
          startDate: searchParams.get('startDate') ?? undefined,
          endDate: searchParams.get('endDate') ?? undefined,
          userIds: searchParams.get('userIds')?.split(','),
          includeMonitor: searchParams.get('includeMonitor') === 'true',
        }}
      />

      {view === 'overview' ? (
        <div aria-hidden>
          {/* 月切替・CSV出力 */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-11 w-52 rounded-control" />
            <Skeleton className="h-10 w-40 rounded-control" />
          </div>
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="hidden h-9 border-b border-line bg-canvas lg:block" />
            <div className="divide-y divide-line">
              {Array.from({ length: USER_ROW_COUNT }, (_, i) => (
                <div key={i} className="flex h-16 items-center gap-6 px-4 sm:px-5">
                  <div className="w-40 space-y-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="hidden h-3.5 flex-1 lg:block" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div aria-hidden>
          {/* 期間・受講生の絞り込み・CSV出力 */}
          <div className="mb-4 flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-5 lg:flex-row lg:items-end">
            <div>
              <Skeleton className="mb-1.5 h-3.5 w-28" />
              <Skeleton className="h-10 w-80 max-w-full rounded-control" />
            </div>
            <div>
              <Skeleton className="mb-1.5 h-3.5 w-12" />
              <Skeleton className="h-10 w-64 max-w-full rounded-control" />
            </div>
            <Skeleton className="h-10 w-40 rounded-control lg:ml-auto" />
          </div>
          <div className="space-y-3">
            <MonitorDayListSkeleton />
          </div>
        </div>
      )}
    </RouteSkeleton>
  );
}
