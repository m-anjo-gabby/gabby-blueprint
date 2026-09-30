'use client';

import { CountBadge, ShellPageHeader } from '@/components/shell/ShellPage';
import { PillTabs } from '@/components/shell/PillTabs';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { ContentCardSkeleton } from '@/components/common/ContentCardSkeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { buildTypeTabs } from '../_lib/typeTabs';

const TYPE_TABS = buildTypeTabs();
const CARD_COUNT = 4;

const noop = () => {};

/**
 * 教材一覧の読み込み中表示（loading.tsx 用）。
 * 見出し・種別タブは本物を描き、件数・検索欄・教材カードだけを骨組みにする（LibraryView と同じ構成）。
 */
export function LibrarySkeleton() {
  return (
    <RouteSkeleton>
      <ShellPageHeader title="教材" aside={<CountBadge count={null} />}>
        <Skeleton className="h-12 w-full rounded-control" />
        <PillTabs items={TYPE_TABS} value="All" onValueChange={noop} aria-label="教材種別" />
      </ShellPageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: CARD_COUNT }, (_, i) => (
          <ContentCardSkeleton key={i} />
        ))}
      </div>
    </RouteSkeleton>
  );
}
