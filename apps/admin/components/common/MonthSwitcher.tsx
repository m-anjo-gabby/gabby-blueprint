'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MonthPickerPopover } from './MonthPickerPopover';

function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * URLのクエリ（?month=YYYY-MM）で表示月を切り替える前月・翌月ボタンと月選択。
 * クエリだけが変わる遷移では loading.tsx が出ないため、ページ側で結果の区画を月ごとに
 * key を変えた Suspense で包むこと（例: training-reports/page.tsx）。
 */
export function MonthSwitcher({ currentMonth, paramName = 'month' }: { currentMonth: string; paramName?: string }) {
  const t = useTranslations('common');
  const tMonths = useTranslations('common.monthPicker.months');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goTo = (yearMonth: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(paramName, yearMonth);
    router.push(`${pathname}?${params.toString()}`);
  };

  const [year, month] = currentMonth.split('-').map(Number);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => goTo(shiftMonth(currentMonth, -1))}
        className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
        aria-label={t('prevMonth')}
      >
        <ChevronLeft size={16} />
      </button>
      <MonthPickerPopover currentMonth={currentMonth} onSelect={goTo}>
        <button
          type="button"
          className="min-w-[6rem] text-center text-sm font-bold text-slate-800 rounded-md px-2 py-1 hover:bg-slate-100 transition-colors"
        >
          {t('monthLabel', { year, month: tMonths(`m${month}`) })}
        </button>
      </MonthPickerPopover>
      <button
        type="button"
        onClick={() => goTo(shiftMonth(currentMonth, 1))}
        className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
        aria-label={t('nextMonth')}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
