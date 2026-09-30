import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  getMonitorUserList, 
  getMonitorWordHistory, 
  getMonitorSprintHistory, 
  MonitorUser 
} from '@/actions/monitorAction';
import { MonitorUserList } from './_components/MonitorUserList';
import { MonitorWordHistoryView } from './_components/MonitorWordHistoryView';
import { MonitorSprintHistoryView } from './_components/MonitorSprintHistoryView';
import { MonitorToggle } from './_components/MonitorToggle';
import { MONITOR_PAGE_CLASS, MonitorHeader, MonitorToggleSkeleton, type MonitorViewType } from './_components/MonitorHeader';

export const dynamic = 'force-dynamic';

interface MonitorPageProps {
  searchParams: Promise<{
    view?: MonitorViewType;
    month?: string;
    userIds?: string;
    startDate?: string;
    endDate?: string;
    includeMonitor?: string;
  }>;
}

export default async function MonitorPage({ searchParams }: MonitorPageProps) {
  const resolvedParams = await searchParams;
  const { 
    view = 'overview', 
    userIds, 
    startDate: qStart, 
    endDate: qEnd,
    includeMonitor: qIncludeMonitor
  } = resolvedParams;

  const includeMonitor = qIncludeMonitor === 'true';

  // デフォルトの期間計算（当月月初〜月末）
  const now = new Date();
  const year = now.getFullYear();
  const m = now.getMonth();
  
  const defStart = new Date(Date.UTC(year, m, 1)).toISOString().split('T')[0];
  const defEnd = new Date(Date.UTC(year, m + 1, 0, 23, 59, 59)).toISOString().split('T')[0];

  const start = qStart || defStart;
  const end = qEnd || defEnd;
  const selectedUserIds = userIds ? userIds.split(',') : [];

  // 並列データフェッチ
  // 💡 対象期間(start/end)を渡し、「その期間に有効な契約を持っていた生徒」を一覧・絞り込み
  //    候補の対象にする
  const fetchUserList = getMonitorUserList(start, end, includeMonitor);
  const fetchWordHistory = getMonitorWordHistory(start, end, selectedUserIds.length > 0 ? selectedUserIds : undefined, includeMonitor);
  const fetchSprintHistory = getMonitorSprintHistory(start, end, selectedUserIds.length > 0 ? selectedUserIds : undefined, includeMonitor);

  const [userListResult, wordHistoryResult, sprintHistoryResult] = await Promise.all([
    fetchUserList,
    fetchWordHistory,
    fetchSprintHistory
  ]);

  const users: MonitorUser[] = userListResult.success ? userListResult.data : [];
  const wordHistory = wordHistoryResult.success ? wordHistoryResult.data : [];
  const sprintHistory = sprintHistoryResult.success ? sprintHistoryResult.data : { sessions: [], drills: [] };

  return (
    <div className={MONITOR_PAGE_CLASS}>
      <MonitorHeader
        view={view}
        userIds={userIds}
        startDate={qStart}
        endDate={qEnd}
        includeMonitor={includeMonitor}
        toggle={
          <Suspense fallback={<MonitorToggleSkeleton />}>
            <MonitorToggle />
          </Suspense>
        }
      />

      {/* ────────────── メメイン：ダイナミックコンテンツビュー ────────────── */}
      <div className="min-h-[400px]">
        {view === 'overview' && (
          <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-card border border-line/60 bg-slate-50/40" />}>
            <MonitorUserList 
              users={users} 
              wordHistory={wordHistory} 
              sprintHistory={sprintHistory}
            />
          </Suspense>
        )}

        {view === 'word' && (
          <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-card border border-line/60 bg-slate-50/40" />}>
            <MonitorWordHistoryView
              initialData={wordHistory}
              users={users}
              startDate={start}
              endDate={end}
              selectedUserIds={selectedUserIds}
            />
          </Suspense>
        )}

        {view === 'sprint' && (
          <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-card border border-line/60 bg-slate-50/40" />}>
            <MonitorSprintHistoryView
              initialData={sprintHistory}
              users={users}
              startDate={start}
              endDate={end}
              selectedUserIds={selectedUserIds}
            />
          </Suspense>
        )}
      </div>

    </div>
  );
}