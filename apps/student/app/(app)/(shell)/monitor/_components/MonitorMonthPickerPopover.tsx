'use client';

import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const YEAR_BUTTON_CLASS =
  'flex h-9 w-9 items-center justify-center rounded-control text-ink-muted hover:bg-brand-soft hover:text-brand transition-colors';

interface MonitorMonthPickerPopoverProps {
  /** 表示中の月（YYYY-MM） */
  currentMonth: string;
  onSelect: (yearMonth: string) => void;
  disabled?: boolean;
}

/** 年月を直接選んで移動する（前月・翌月の連続操作を省く） */
export function MonitorMonthPickerPopover({ currentMonth, onSelect, disabled }: MonitorMonthPickerPopoverProps) {
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
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label="年月を選択"
          className="h-11 w-11 rounded-control border-line bg-surface text-ink-muted shadow-none hover:bg-brand-soft hover:text-brand"
        >
          <CalendarDays />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-control p-3" align="start">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => setViewYear((y) => y - 1)} className={YEAR_BUTTON_CLASS} aria-label="前年">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-ink tabular-nums">{viewYear}年</span>
          <button type="button" onClick={() => setViewYear((y) => y + 1)} className={YEAR_BUTTON_CLASS} aria-label="翌年">
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
                aria-pressed={isSelected}
                className={cn(
                  'rounded-control py-2 text-sm font-semibold transition-colors',
                  isSelected ? 'bg-brand text-white' : 'text-ink-soft hover:bg-brand-soft hover:text-brand'
                )}
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
