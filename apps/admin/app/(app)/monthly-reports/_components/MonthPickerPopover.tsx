'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const MONTH_KEYS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'];

export function MonthPickerPopover({
  currentMonth,
  onSelect,
  children,
}: {
  currentMonth: string; // "YYYY-MM"
  onSelect: (yearMonth: string) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations('monthlyReports.monthPicker');
  const tMonths = useTranslations('monthlyReports.monthPicker.months');
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
            aria-label={t('prevYear')}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-slate-800">{t('yearLabel', { year: viewYear })}</span>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            className="p-1 rounded-md text-slate-500 hover:bg-slate-100"
            aria-label={t('nextYear')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_KEYS.map((key, i) => {
            const isSelected = viewYear === selectedYear && i + 1 === selectedMonth;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handlePick(i)}
                className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  isSelected ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tMonths(key)}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
