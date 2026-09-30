'use client';

import { Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { PillTabs } from '@/components/shell/PillTabs';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { Skeleton } from '@/components/ui/skeleton';
import { FAVORITE_KINDS, FAVORITE_KIND_IDS, buildKindPills, parseFavoriteKind } from './favoriteKinds';
import { FAVORITES_HEADER, getFavoriteGridClass } from './FavoriteKindSection';

const KIND_PILLS = buildKindPills();

const noop = () => {};

/**
 * お気に入り画面の読み込み中表示（loading.tsx 用）。
 * 見出し・種別ピルは本物を描き、検索欄と一覧だけを骨組みにする（FavoriteKindSection と同じ構成）。
 * 種別は URL（?kind=）で指定されていればその種別のカードで描く。指定が無い場合の本番の既定
 * （お気に入りが登録されている最初の種別）はデータが届くまで分からないため、先頭の種別で描く。
 * 絞り込みのセレクトは選択肢が2つ以上ある時だけ出るため、骨組みでは検索欄の幅いっぱいに描く。
 */
export function FavoritesSkeleton() {
  const searchParams = useSearchParams();
  const kind = parseFavoriteKind(searchParams.get('kind')) ?? FAVORITE_KIND_IDS[0];
  const def = FAVORITE_KINDS[kind];

  return (
    <RouteSkeleton>
      <ShellPageHeader {...FAVORITES_HEADER}>
        <PillTabs items={KIND_PILLS} value={kind} onValueChange={noop} aria-label="お気に入りの種別" />
        <Skeleton className="h-11 w-full rounded-control" />
      </ShellPageHeader>

      <div className={getFavoriteGridClass(def.columns)}>
        {Array.from({ length: def.skeletonCount }, (_, i) => (
          <Fragment key={i}>{def.renderSkeleton()}</Fragment>
        ))}
      </div>
    </RouteSkeleton>
  );
}
