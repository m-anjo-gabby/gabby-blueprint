'use client';

import { useSearchParams } from 'next/navigation';
import { CountBadge, ShellPageHeader } from '@/components/shell/ShellPage';
import { PillTabs } from '@/components/shell/PillTabs';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { ContentCardSkeleton } from '@/components/common/ContentCardSkeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { buildTypeTabs } from '../_lib/typeTabs';
import { LIBRARY_FILTER_ROW_CLASS, isFavoriteOnly } from './LibraryView';
import { FavoriteOnlyToggle } from './FavoriteOnlyToggle';

const TYPE_TABS = buildTypeTabs();
const CARD_COUNT = 4;

const noop = () => {};

/**
 * 教材一覧の読み込み中表示（loading.tsx 用）。
 * 種別タブ・お気に入りの切り替え（URL の状態どおり）は本物を描き、件数・検索欄・教材カードだけを骨組みにする（LibraryView と同じ構成）。
 */
export function LibrarySkeleton() {
  const searchParams = useSearchParams();
  return (
    <RouteSkeleton>
      <ShellPageHeader title="教材" titleHidden>
        <div className="flex gap-2">
          <Skeleton className="h-12 min-w-0 flex-1 rounded-control" />
          <FavoriteOnlyToggle pressed={isFavoriteOnly(searchParams)} onPressedChange={noop} />
        </div>
        <div className={LIBRARY_FILTER_ROW_CLASS}>
          <div className="min-w-0 flex-1">
            <PillTabs items={TYPE_TABS} value="All" onValueChange={noop} aria-label="教材種別" />
          </div>
          <CountBadge count={null} />
        </div>
      </ShellPageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: CARD_COUNT }, (_, i) => (
          <ContentCardSkeleton key={i} />
        ))}
      </div>
    </RouteSkeleton>
  );
}
