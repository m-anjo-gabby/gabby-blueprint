'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useServerSyncedState } from '@gabby/lib/hooks/useServerSyncedState';
import { useRefreshOnRestoredRender } from '@gabby/lib/hooks/useRefreshOnRestoredRender';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { PillTabs } from '@/components/shell/PillTabs';
import { FavoriteKindSection } from './FavoriteKindSection';
import { FavoriteAudioProvider } from './FavoriteAudioProvider';
import { replaceSearchParams } from './favoriteUrl';
import { FAVORITE_TOGGLE_NETWORK_ERROR, getFavoriteToggleErrorMessage } from '@/constants/favorites';
import {
  FAVORITE_KINDS,
  FAVORITE_KIND_IDS,
  buildKindPills,
  parseFavoriteKind,
  type FavoriteItemMap,
  type FavoriteKindDef,
  type FavoriteKindId,
  type FavoriteLists,
} from './favoriteKinds';

interface FavoritesViewProps {
  initialLists: FavoriteLists;
  /** サーバー描画ごとのID（キャッシュ済みの画面の再利用を検知して取り直すために使う） */
  renderId: string;
}

/**
 * お気に入り画面の本体。種別（教材・フレーズ等）をピルで切り替え、種別ごとの一覧を表示する。
 * 表示中の種別は URL（?kind=）で持ち、ホーム等から種別を指定して開けるようにする。
 * 切り替えは history.replaceState で行い、サーバーへの再取得や履歴の積み上げをしない。
 * 音声は一覧で1つのプレイヤーを共有する（FavoriteAudioProvider）。
 */
export function FavoritesView({ initialLists, renderId }: FavoritesViewProps) {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const [lists, setLists] = useServerSyncedState(initialLists);
  // 「戻る・進む」等でキャッシュ済みの画面が再利用された場合は、最新のデータに取り直す
  useRefreshOnRestoredRender(renderId);

  // 種別の指定が無い場合は、お気に入りが登録されている最初の種別を開く
  const [defaultKind] = useState<FavoriteKindId>(
    () => FAVORITE_KIND_IDS.find((id) => initialLists[id].length > 0) ?? FAVORITE_KIND_IDS[0]
  );
  const kind = parseFavoriteKind(searchParams.get('kind')) ?? defaultKind;

  // 種別ごとに絞り込みの項目が違うため、切り替えたら前の種別の絞り込み条件は外す
  const handleKindChange = (next: FavoriteKindId) => {
    replaceSearchParams('', (params) => params.set('kind', next));
  };

  const pills = useMemo(() => buildKindPills(lists), [lists]);

  const handleRemove = useCallback(async <K extends FavoriteKindId>(kindId: K, item: FavoriteItemMap[K]) => {
    const def: FavoriteKindDef<FavoriteItemMap[K]> = FAVORITE_KINDS[kindId];
    const ok = await showConfirm(
      'お気に入りから削除',
      `この${def.noun}をお気に入りから削除しますか？`,
      { variant: 'danger' }
    );
    if (!ok) return;

    const key = def.getKey(item);
    const index = lists[kindId].findIndex((i) => def.getKey(i) === key);
    const replaceList = (update: (list: FavoriteItemMap[K][]) => FavoriteItemMap[K][]) =>
      setLists((prev) => ({ ...prev, [kindId]: update(prev[kindId]) }));

    // 楽観的に一覧から外し、失敗した場合は元の位置に戻す
    replaceList((list) => list.filter((i) => def.getKey(i) !== key));
    const result = await def.remove(item).catch(() => FAVORITE_TOGGLE_NETWORK_ERROR);
    if (result.ok) {
      showToast('お気に入りから削除しました', 'success');
      return;
    }
    replaceList((list) => {
      if (list.some((i) => def.getKey(i) === key)) return list;
      const next = [...list];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
      return next;
    });
    showToast(getFavoriteToggleErrorMessage(result), 'error');
  }, [lists, setLists, showConfirm, showToast]);

  return (
    <FavoriteAudioProvider>
      {renderSection(
        kind,
        lists[kind],
        <PillTabs items={pills} value={kind} onValueChange={handleKindChange} aria-label="お気に入りの種別" />,
        handleRemove
      )}
    </FavoriteAudioProvider>
  );
}

// 種別（K）と一覧・定義の型を対応づけたまま描画するためのヘルパー
function renderSection<K extends FavoriteKindId>(
  kind: K,
  items: FavoriteItemMap[K][],
  pills: ReactNode,
  onRemove: (kind: K, item: FavoriteItemMap[K]) => void
) {
  const def: FavoriteKindDef<FavoriteItemMap[K]> = FAVORITE_KINDS[kind];
  // 種別を切り替えたら検索・絞り込みを初期状態に戻す
  return (
    <FavoriteKindSection
      key={kind}
      def={def}
      items={items}
      pills={pills}
      onRemove={(item) => onRemove(kind, item)}
    />
  );
}
