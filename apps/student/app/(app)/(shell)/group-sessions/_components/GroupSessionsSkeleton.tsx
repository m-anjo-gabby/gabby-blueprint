'use client';

import { ShellPageHeader } from '@/components/shell/ShellPage';
import { PillTabs, type PillTabItem } from '@/components/shell/PillTabs';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { Skeleton } from '@/components/ui/skeleton';

export type GroupSessionsTab = 'upcoming' | 'past';

const TABS: readonly PillTabItem<GroupSessionsTab>[] = [
  { value: 'upcoming', label: 'これから' },
  { value: 'past', label: '過去のセッション' },
];

/** URL の ?tab= から表示中のタブを決める（未指定・不正な値は「これから」） */
export function parseGroupSessionsTab(value: string | null): GroupSessionsTab {
  return value === 'past' ? 'past' : 'upcoming';
}

/** 画面の見出しとタブ（画面と骨組みで共有する）。入口がホームとイベントの詳細の2つあるため、戻るは履歴を使う */
export function GroupSessionsHeader({ tab, onTabChange }: { tab: GroupSessionsTab; onTabChange: (tab: GroupSessionsTab) => void }) {
  return (
    <ShellPageHeader
      title="グループセッション"
      back={{ history: '/dashboard' }}
      description="Gabbyのプロコーチから直接学べる、ご契約中の方限定の無料セッションです。参加したい回を「参加予定」にすると、参加用のリンクが表示されます。"
    >
      <PillTabs items={TABS} value={tab} onValueChange={onTabChange} aria-label="表示する期間" />
    </ShellPageHeader>
  );
}

/** シリーズのカード（SeriesCard と同じ枠）の骨組み */
export function SeriesCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="rounded-card border border-line bg-surface p-5 shadow-xs sm:p-6">
      <div className="flex h-6 items-center">
        <Skeleton className="h-5 w-56 max-w-full" />
      </div>
      <Skeleton className="mt-2 h-3.5 w-full" />
      <Skeleton className="mt-1.5 h-3.5 w-2/3" />
      <ul className="mt-4 divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-48 max-w-full" />
            </div>
            <Skeleton className="h-8 w-24 rounded-control" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 画面遷移中の骨組み（loading.tsx・ShellRouteSkeleton 用。見出し・タブは本物）。
 * 骨組みでは URL のクエリを読まない（読み込み中の表示で useSearchParams を使うと Suspense の境界が要るため）。タブは「これから」で描く
 */
export function GroupSessionsSkeleton() {
  return (
    <RouteSkeleton>
      <GroupSessionsHeader tab="upcoming" onTabChange={() => {}} />
      <div className="space-y-4">
        <SeriesCardSkeleton />
        <SeriesCardSkeleton rows={2} />
      </div>
    </RouteSkeleton>
  );
}
