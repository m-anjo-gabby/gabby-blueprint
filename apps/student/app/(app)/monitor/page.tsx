import React, { Suspense } from 'react';
import Link from 'next/link';
import { 
  Users, 
  LayoutDashboard, 
  BookOpen, 
  Zap, 
  ArrowLeft
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
  const fetchUserList = getMonitorUserList(includeMonitor);
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
    { id: 'overview' as const, label: '受講生サマリー', icon: LayoutDashboard, description: '全体の稼働・進捗状況' },
    { id: 'word' as const, label: '単語ドリル履歴', icon: BookOpen, description: '語彙ログの絞り込み分析' },
    { id: 'sprint' as const, label: 'スプリント履歴', icon: Zap, description: '瞬発ログの絞り込み分析' },
  ];

  const currentNav = navItems.find(item => item.id === view) || navItems[0];

  return (
    <div className="w-full max-w-7xl mx-auto py-5 sm:py-8 px-4 sm:px-6 md:px-8 space-y-6 text-slate-900 selection:bg-indigo-100">
      
      {/* ────────────── 🚀 フラット＆ミニマル・グランドヘッダー ────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        
        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-[0.12em] font-mono select-none group transition-colors"
          >
            <ArrowLeft size={10} className="transform group-hover:-translate-x-0.5 transition-transform" strokeWidth={3} />
            <span>Dashboard</span>
            <span className="text-slate-300 mx-0.5">/</span>
            <span className="text-indigo-500/90">Client Monitor</span>
          </Link>

          <div className="pt-0.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Users size={22} className="text-indigo-500 shrink-0" strokeWidth={2.5} />
              モニタリングダッシュボード
            </h1>

            <p className="text-xs font-bold text-slate-400 max-w-2xl leading-relaxed mt-1">
              所属受講生のトレーニング成果のトラッキング、および詳細ログのアナリティクス
            </p>
          </div>
        </div>

        <div className="hidden sm:block text-right">
          <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest font-mono block">
            Current Module
          </span>
          <span className="text-xs font-bold text-slate-400">
            {currentNav.label}
          </span>
        </div>
      </div>

      {/* ────────────── メーターナビゲーション（タブ形式） & グローバルトグル ────────────── */}
      <div className="border-b border-slate-200/60 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        
        {/* 左側：タブメニュー */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/70 border border-slate-200/40 rounded-xl overflow-x-auto w-full sm:w-auto scrollbar-none">
          {navItems.map((item) => {
            const isActive = view === item.id;
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={`/monitor?view=${item.id}${userIds ? `&userIds=${userIds}` : ''}${qStart ? `&startDate=${qStart}` : ''}${qEnd ? `&endDate=${qEnd}` : ''}${includeMonitor ? '&includeMonitor=true' : ''}`}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap group select-none",
                  isActive 
                    ? "bg-white text-slate-800 shadow-2xs border border-slate-200/60" 
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <Icon 
                  size={13} 
                  strokeWidth={isActive ? 2.5 : 2} 
                  className={cn("transition-transform", isActive ? "text-indigo-500" : "text-slate-400 group-hover:text-slate-600")} 
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
          <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-[24px] border border-slate-200/60 bg-slate-50/40" />}>
            <MonitorUserList 
              users={users} 
              wordHistory={wordHistory} 
              sprintHistory={sprintHistory}
            />
          </Suspense>
        )}

        {view === 'word' && (
          <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-[24px] border border-slate-200/60 bg-slate-50/40" />}>
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
          <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-[24px] border border-slate-200/60 bg-slate-50/40" />}>
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