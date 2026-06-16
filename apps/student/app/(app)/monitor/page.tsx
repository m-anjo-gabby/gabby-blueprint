import { getMonitorUserList, getMonitorWordHistory, getMonitorSprintHistory, MonitorUser } from '@/actions/monitorAction';
import { MonitorUserList } from './_components/MonitorUserList';
import { MonitorWordHistoryView } from './_components/MonitorWordHistoryView';
import { MonitorSprintHistoryView } from './_components/MonitorSprintHistoryView';
import { BarChart3, Users } from 'lucide-react';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

interface MonitorPageProps {
  searchParams: {
    month?: string;
    userIds?: string; // Comma-separated user IDs
  };
}

export default async function MonitorPage({ searchParams }: MonitorPageProps) {
  const { month, userIds } = searchParams;

  // デフォルトは現在の月
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetMonth = month || currentMonth;

  const selectedUserIds = userIds ? userIds.split(',') : [];

  // Fetch data concurrently
  const [
    userListResult,
    wordHistoryResult,
    sprintHistoryResult
  ] = await Promise.all([
    getMonitorUserList(),
    getMonitorWordHistory(targetMonth, selectedUserIds.length > 0 ? selectedUserIds : undefined),
    getMonitorSprintHistory(targetMonth, selectedUserIds.length > 0 ? selectedUserIds : undefined)
  ]);

  const users: MonitorUser[] = userListResult.success ? userListResult.data : [];
  const wordHistory = wordHistoryResult.success ? wordHistoryResult.data : [];
  const sprintHistory = sprintHistoryResult.success ? sprintHistoryResult.data : [];

  return (
    <div className="w-full max-w-6xl mx-auto py-8 px-4 space-y-8">
      <div className="bg-indigo-50/60 border-b border-indigo-100/40 p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-3 opacity-[0.08] pointer-events-none">
          <BarChart3 size={115} strokeWidth={1.2} className="text-indigo-600" />
        </div>
        <h1 className="text-2xl font-black text-indigo-800 flex items-center gap-3 relative">
          <Users size={32} className="text-indigo-600" />
          モニタリングダッシュボード
        </h1>
        <p className="text-sm text-slate-600 mt-2 relative">
          所属クライアントの受講生たちの学習状況を一覧で確認できます。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
            <MonitorUserList
              users={users}
            />
          </Suspense>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
            <MonitorWordHistoryView
              initialData={wordHistory}
              targetMonth={targetMonth}
              selectedUserIds={selectedUserIds}
            />
          </Suspense>

          <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
            <MonitorSprintHistoryView
              initialData={sprintHistory}
              targetMonth={targetMonth}
              selectedUserIds={selectedUserIds}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}