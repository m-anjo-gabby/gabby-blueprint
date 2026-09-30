'use client';

import { useSearchParams } from 'next/navigation';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { toIsoMonthInZone } from '@gabby/lib/date/date';

/**
 * 月ごとの記録画面（トレーニング記録・単語帳/スプリントの履歴）の読み込み中表示で使う表示月（YYYY-MM）。
 * page.tsx と同じく ?month= を優先し、無ければ利用者のタイムゾーンでの今月にする
 * （useMonthNavigator の「今月」と同じ求め方）。
 */
export function useUrlMonth(): string {
  const searchParams = useSearchParams();
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  return searchParams.get('month') || toIsoMonthInZone(new Date(), timezone);
}
