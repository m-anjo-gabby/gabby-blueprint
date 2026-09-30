'use client';

import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { useUrlMonth } from '@/lib/useUrlMonth';
import { WordHistoryView } from './WordHistoryView';

/** 単語帳の履歴の読み込み中表示（loading.tsx 用）。本番の画面をデータ無しで描き、数値と一覧だけを骨組みにする */
export function WordHistorySkeleton() {
  const targetMonth = useUrlMonth();
  return (
    <RouteSkeleton>
      <WordHistoryView initialData={null} targetMonth={targetMonth} />
    </RouteSkeleton>
  );
}
