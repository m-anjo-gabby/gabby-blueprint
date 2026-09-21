'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminCoachSummary } from '@gabby/types/adminLiveSession';
import { MonthPickerPopover } from './MonthPickerPopover';

function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabelJa(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return `${year}年${month}月`;
}

export function CoachMonthSelector({
  coaches,
  currentCoachId,
  currentMonth,
}: {
  coaches: AdminCoachSummary[];
  currentCoachId: string;
  currentMonth: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={currentCoachId}
        onChange={(e) => updateParams({ coachId: e.target.value })}
        className="px-3 py-2 border rounded-md text-sm text-slate-700 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
      >
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.user_name}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => updateParams({ month: shiftMonth(currentMonth, -1) })}
          className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
          aria-label="前月"
        >
          <ChevronLeft size={16} />
        </button>
        <MonthPickerPopover currentMonth={currentMonth} onSelect={(yearMonth) => updateParams({ month: yearMonth })}>
          <button
            type="button"
            className="min-w-[6rem] text-center text-sm font-bold text-slate-800 rounded-md px-2 py-1 hover:bg-slate-100 transition-colors"
          >
            {formatMonthLabelJa(currentMonth)}
          </button>
        </MonthPickerPopover>
        <button
          type="button"
          onClick={() => updateParams({ month: shiftMonth(currentMonth, 1) })}
          className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
          aria-label="翌月"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
