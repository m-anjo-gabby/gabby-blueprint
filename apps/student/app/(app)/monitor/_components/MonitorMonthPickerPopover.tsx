'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

interface MonitorMonthPickerPopoverProps {
  currentMonth: string; // "YYYY-MM"
  onSelect: (yearMonth: string) => void;
  children: React.ReactNode;
}

export const MonitorMonthPickerPopover: React.FC<MonitorMonthPickerPopoverProps> = ({
  currentMonth,
  onSelect,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [selectedYear, selectedMonth] = currentMonth.split('-').map(Number);
  const [viewYear, setViewYear] = useState(selectedYear);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setViewYear(selectedYear);
  };

  const handlePick = (monthIndex: number) => {
    onSelect(`${viewYear}-${String(monthIndex + 1).padStart(2, '0')}`);
    setOpen(false);
  };

  const handleToday = () => {
    const now = new Date();
    onSelect(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64" align="center">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            className="p-1 rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="前年"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-slate-800">{viewYear}年</span>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            className="p-1 rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="翌年"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {MONTH_LABELS.map((label, i) => {
            const isSelected = viewYear === selectedYear && i + 1 === selectedMonth;
            return (
              <button
                key={label}
                type="button"
                onClick={() => handlePick(i)}
                className={cn(
                  'rounded-md py-1.5 text-xs font-semibold transition-colors',
                  isSelected ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleToday}
          className="w-full text-center text-xs font-bold text-indigo-600 hover:text-indigo-700 py-1.5 rounded-md hover:bg-indigo-50 transition-colors"
        >
          今月に戻る
        </button>
      </PopoverContent>
    </Popover>
  );
};
