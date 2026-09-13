'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Adds/subtracts whole months to a "YYYY-MM" string, returning a new "YYYY-MM" string */
function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function MonthSelector({ currentMonth }: { currentMonth: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigateTo = (yearMonth: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('month', yearMonth);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => navigateTo(shiftMonth(currentMonth, -1))}
        className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[9rem] text-center text-sm font-bold text-slate-800">
        {formatMonthLabel(currentMonth)}
      </span>
      <button
        type="button"
        onClick={() => navigateTo(shiftMonth(currentMonth, 1))}
        className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
