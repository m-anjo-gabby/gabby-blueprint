import React, { Suspense } from 'react';
import Link from 'next/link';
import { 
  Users, 
  LayoutDashboard, 
  BookOpen, 
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { MonitorToggle } from './_components/MonitorToggle'; // 💡 追加

export const dynamic = 'force-dynamic';

type MonitorViewType = 'overview' | 'word' | 'sprint';

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

  const navItems = [
    { id: 'overview' as const, label: '受講生サマリー', icon: LayoutDashboard },
    { id: 'word' as const, label: '単語ドリル履歴', icon: BookOpen },
    { id: 'sprint' as const, label: 'スプリント履歴', icon: Zap },
  ];


  return (
    <div className="w-full max-w-7xl mx-auto py-5 sm:py-8 px-4 sm:px-6 md:px-8 space-y-6 text-ink selection:bg-brand-100">
      
      {/* ────────────── ヘッダー ────────────── */}
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight text-ink">
          <Users size={22} className="shrink-0 text-brand" />
          モニタリングダッシュボード
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
          所属する受講生の学習状況を月ごとに確認し、CSVで出力できます。
        </p>
      </header>

      {/* ────────────── メーターナビゲーション（タブ形式） & グローバルトグル ────────────── */}
      <div className="border-b border-line pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        
        {/* 左側：タブメニュー */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-control overflow-x-auto w-full sm:w-auto scrollbar-none">
          {navItems.map((item) => {
            const isActive = view === item.id;
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={`/monitor?view=${item.id}${userIds ? `&userIds=${userIds}` : ''}${qStart ? `&startDate=${qStart}` : ''}${qEnd ? `&endDate=${qEnd}` : ''}${includeMonitor ? '&includeMonitor=true' : ''}`}
                className={cn(
                  "flex h-9 items-center gap-2 px-4 rounded-[calc(var(--radius-control)-0.25rem)] text-sm font-semibold transition-all whitespace-nowrap group select-none",
                  isActive
                    ? "bg-surface text-ink shadow-sm"
                    : "text-ink-muted hover:text-ink"
                )}
              >
                <Icon
                  size={15}
                  className={cn("transition-colors", isActive ? "text-brand" : "text-ink-subtle group-hover:text-ink-soft")}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* 💡 右側：グローバルモニター切り替えトグル */}
        <div className="self-start sm:self-auto shrink-0">
          <Suspense fallback={<div className="h-[38px] w-36 bg-slate-100 animate-pulse rounded-xl" />}>
            <MonitorToggle />
          </Suspense>
        </div>

      </div>

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