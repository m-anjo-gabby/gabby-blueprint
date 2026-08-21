'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '../stores/useUserStore';
import { toIsoMonthInZone } from '../date/date';

export interface UseMonthNavigatorOptions {
  /** 表示中の月（"YYYY-MM"形式） */
  targetMonth: string;
  /** 月変更後の遷移先ベースパス（例: "/training/word/history"）。クエリは `?month=YYYY-MM` で付与される */
  basePath: string;
  /** 遷移方法。履歴を残したくない画面（スクロール位置維持等）は 'replace' を指定 */
  navigate?: 'push' | 'replace';
}

/**
 * 単語履歴・スプリント履歴の両画面で完全に一致していた「YYYY-MM文字列の前月/翌月ナビゲーション
 * （年またぎの繰り上げ/繰り下げ含む）」ロジックのみを集約した共通フック。
 * 月ナビゲーションのUI（カプセルボタン等）自体は画面ごとにデザインが異なるため含めず、
 * 呼び出し側で自由にレンダリングする。
 */
export function useMonthNavigator({ targetMonth, basePath, navigate = 'push' }: UseMonthNavigatorOptions) {
  const router = useRouter();
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  const currentMonthStr = useMemo(() => toIsoMonthInZone(new Date(), timezone), [timezone]);

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const [year, month] = targetMonth.split('-').map(Number);
    let newYear = year;
    let newMonth = direction === 'prev' ? month - 1 : month + 1;

    if (newMonth === 0) {
      newMonth = 12;
      newYear -= 1;
    } else if (newMonth === 13) {
      newMonth = 1;
      newYear += 1;
    }

    const targetMonthStr = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    const url = `${basePath}?month=${targetMonthStr}`;

    if (navigate === 'replace') {
      router.replace(url, { scroll: false });
    } else {
      router.push(url);
    }
  };

  const [displayYear, displayMonth] = targetMonth.split('-');
  const isNotCurrentMonth = targetMonth !== currentMonthStr;

  return { currentMonthStr, displayYear, displayMonth, isNotCurrentMonth, handleMonthChange };
}
