'use client';

import { useSearchParams } from 'next/navigation';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { toIsoMonthInZone } from '@gabby/lib/date/date';
import { ScheduleTabs } from '@/components/common/ScheduleTabs';
import { PageHeader, PageSkeletonFrame } from '@/components/common/PageHeader';
import { CalendarBoard } from './CalendarBoard';
import { CalendarWorkspaceGrid } from './CalendarWorkspace';
import { PendingRequestsPanelSkeleton } from './PendingRequestsPanel';

/** 画面の見出しとタブ（page.tsx と骨組みで共有する） */
export function CalendarPageHeader() {
  return (
    <>
      <PageHeader
        title="Calendar"
        description="View your lessons, group sessions, and maintenance notices. You can cancel or reschedule any session before it starts."
      />
      <ScheduleTabs active="calendar" />
    </>
  );
}

/**
 * カレンダー画面の読み込み中表示（loading.tsx 用）。
 * 見出し・タブと、表示月（?month=、無ければコーチのタイムゾーンでの今月）の日付の枠は本物を描き、
 * 予定と Pending Requests の中身を骨組みにする。
 */
export function CalendarSkeleton() {
  const searchParams = useSearchParams();
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const month = searchParams.get('month') || toIsoMonthInZone(new Date(), timezone);

  return (
    <PageSkeletonFrame>
      <CalendarPageHeader />
      <div className="max-w-5xl">
        <CalendarWorkspaceGrid
          board={<CalendarBoard month={month} initialSessions={null} initialEvents={null} />}
          panel={<PendingRequestsPanelSkeleton />}
        />
      </div>
    </PageSkeletonFrame>
  );
}
