import Link from 'next/link';
import { BookOpen, LayoutDashboard, Users, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type MonitorViewType = 'overview' | 'word' | 'sprint';

const NAV_ITEMS = [
  { id: 'overview' as const, label: '受講生サマリー', icon: LayoutDashboard },
  { id: 'word' as const, label: '単語ドリル履歴', icon: BookOpen },
  { id: 'sprint' as const, label: 'スプリント履歴', icon: Zap },
];

/** モニター切り替え（MonitorToggle）の読み込み中の骨組み */
export function MonitorToggleSkeleton() {
  return <Skeleton className="h-9.5 w-36 rounded-xl" />;
}

/** 画面の外枠（page.tsx と読み込み中の骨組みで共有する） */
export const MONITOR_PAGE_CLASS = 'w-full max-w-7xl mx-auto py-5 sm:py-8 px-4 sm:px-6 md:px-8 space-y-6 text-ink selection:bg-brand-100';

interface MonitorHeaderProps {
  view: MonitorViewType;
  /** 表示中の絞り込み条件（タブを切り替えても引き継ぐ） */
  userIds?: string;
  startDate?: string;
  endDate?: string;
  includeMonitor: boolean;
  /** タブ右側のモニター切り替え（読み込み中は骨組みを渡す） */
  toggle: React.ReactNode;
}

/** モニタリングダッシュボードの見出しとタブ（page.tsx と読み込み中の骨組みで共有する） */
export function MonitorHeader({ view, userIds, startDate, endDate, includeMonitor, toggle }: MonitorHeaderProps) {
  const query = `${userIds ? `&userIds=${userIds}` : ''}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}${includeMonitor ? '&includeMonitor=true' : ''}`;

  return (
    <>
      {/* ────────────── ヘッダー ────────────── */}
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight text-ink">
          <Users size={22} className="shrink-0 text-brand" />
          モニタリングダッシュボード
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
          所属する受講生のトレーニング状況を月ごとに確認し、CSVで出力できます。
        </p>
      </header>

      {/* ────────────── タブ & グローバルトグル ────────────── */}
      <div className="border-b border-line pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-control overflow-x-auto w-full sm:w-auto scrollbar-none">
          {NAV_ITEMS.map((item) => {
            const isActive = view === item.id;
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={`/monitor?view=${item.id}${query}`}
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

        <div className="self-start sm:self-auto shrink-0">{toggle}</div>
      </div>
    </>
  );
}
