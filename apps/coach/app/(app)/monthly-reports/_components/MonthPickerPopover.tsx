'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function MonthPickerPopover({
  currentMonth,
  onSelect,
  children,
}: {
  currentMonth: string; // "YYYY-MM"
  onSelect: (yearMonth: string) => void;
  children: React.ReactNode;
}) {
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

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            className="p-1 rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="Previous year"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-slate-800">{viewYear}</span>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            className="p-1 rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="Next year"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_LABELS.map((label, i) => {
            const isSelected = viewYear === selectedYear && i + 1 === selectedMonth;
            return (
              <button
                key={label}
                type="button"
                onClick={() => handlePick(i)}
                className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  isSelected ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
