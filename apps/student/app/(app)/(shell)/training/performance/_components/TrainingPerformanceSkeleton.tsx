'use client';

import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { useUrlMonth } from '@/lib/useUrlMonth';
import { TrainingPerformance } from './TrainingPerformance';

/**
 * トレーニング記録の読み込み中表示（loading.tsx 用）。
 * 画面の大半（見出し・月切替・カード・カレンダーの日付）はデータに依存しないため、本番の部品を
 * データ無し（initialData=null）で描き、数値だけを骨組みにする。
 */
export function TrainingPerformanceSkeleton() {
  const targetMonth = useUrlMonth();
  return (
    <RouteSkeleton>
      <TrainingPerformance initialData={null} targetMonth={targetMonth} />
    </RouteSkeleton>
  );
}
