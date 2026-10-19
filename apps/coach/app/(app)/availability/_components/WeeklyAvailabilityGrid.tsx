'use client';

import { useCallback, useEffect, useEffectEvent, useRef } from 'react';
import { DAYS_OF_WEEK, type DayOfWeek } from '@gabby/types/coachAvailability';
import { DAY_OF_WEEK_SHORT_LABEL_EN } from '@/constants/availability';
import { cn } from '@/lib/utils';

/** グリッドの細かさ: 1マス = 30分で、1日分（48マス）。 */
export const SLOTS_PER_DAY = 48;

export function slotKey(day: DayOfWeek, slotIndex: number): string {
  return `${day}-${slotIndex}`;
}

export function slotIndexToLabel(slotIndex: number): string {
  const hour = Math.floor(slotIndex / 2)
    .toString()
    .padStart(2, '0');
  const minute = slotIndex % 2 === 0 ? '00' : '30';
  return `${hour}:${minute}`;
}

interface WeeklyAvailabilityGridProps {
  selection: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}

/**
 * Calendly のような毎週の空き時間のグリッド。列は曜日、行は30分の
 * 区切り。押したままなぞるとマスを塗る（または消す）。保存の時に呼び出し側がマスを
 * 続いた時間の範囲にまとめる。
 */
export function WeeklyAvailabilityGrid({ selection, onChange, disabled }: WeeklyAvailabilityGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const paintValueRef = useRef(true);

  // 初めて表示した時だけ、選んでいる時間帯（無ければ 08:00）の位置までスクロールする
  const scrollToSelection = useEffectEvent(() => {
    const rowHeight = 22;
    let firstSelected = SLOTS_PER_DAY;
    for (const key of selection) {
      const slotIndex = Number(key.split('-')[1]);
      if (slotIndex < firstSelected) firstSelected = slotIndex;
    }
    const targetSlot = firstSelected < SLOTS_PER_DAY ? firstSelected : 16; // 既定: 08:00
    const container = scrollRef.current;
    if (container) {
      container.scrollTop = Math.max(0, targetSlot * rowHeight - rowHeight * 2);
    }
  });
  useEffect(() => {
    scrollToSelection();
  }, []);

  const paintCell = useCallback(
    (day: DayOfWeek, slotIndex: number, value: boolean) => {
      const key = slotKey(day, slotIndex);
      const isSelected = selection.has(key);
      if (isSelected === value) return;
      const next = new Set(selection);
      if (value) next.add(key);
      else next.delete(key);
      onChange(next);
    },
    [selection, onChange],
  );

  const handlePointerDown = (day: DayOfWeek, slotIndex: number) => {
    if (disabled) return;
    const key = slotKey(day, slotIndex);
    const nextValue = !selection.has(key);
    draggingRef.current = true;
    paintValueRef.current = nextValue;
    paintCell(day, slotIndex, nextValue);
  };

  const handlePointerEnter = (day: DayOfWeek, slotIndex: number) => {
    if (!draggingRef.current || disabled) return;
    paintCell(day, slotIndex, paintValueRef.current);
  };

  useEffect(() => {
    const stopDragging = () => {
      draggingRef.current = false;
    };
    window.addEventListener('pointerup', stopDragging);
    return () => window.removeEventListener('pointerup', stopDragging);
  }, []);

  return (
    <div
      ref={scrollRef}
      className="max-h-[420px] overflow-y-auto rounded-lg border border-slate-200 select-none"
      style={{ touchAction: 'none' }}
    >
      <div className="grid" style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }}>
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200" />
        {DAYS_OF_WEEK.map((day) => (
          <div
            key={day}
            className="sticky top-0 z-20 bg-white border-b border-slate-200 py-1.5 text-center text-[10px] font-black text-slate-500 uppercase tracking-wide"
          >
            {DAY_OF_WEEK_SHORT_LABEL_EN[day]}
          </div>
        ))}

        {Array.from({ length: SLOTS_PER_DAY }, (_, slotIndex) => slotIndex).map((slotIndex) => {
          const isHour = slotIndex % 2 === 0;
          return (
            <div key={slotIndex} className="contents">
              <div
                className={cn(
                  'h-[22px] pr-2 text-right text-[10px] text-slate-400 font-medium leading-[22px]',
                  isHour ? 'border-t border-slate-200' : 'border-t border-slate-100',
                )}
              >
                {isHour ? slotIndexToLabel(slotIndex) : ''}
              </div>
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = selection.has(slotKey(day, slotIndex));
                return (
                  <button
                    key={day}
                    type="button"
                    tabIndex={-1}
                    disabled={disabled}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handlePointerDown(day, slotIndex);
                    }}
                    onPointerEnter={() => handlePointerEnter(day, slotIndex)}
                    aria-pressed={isSelected}
                    aria-label={`${DAY_OF_WEEK_SHORT_LABEL_EN[day]} ${slotIndexToLabel(slotIndex)}`}
                    className={cn(
                      'h-[22px] border-l border-slate-100 transition-colors disabled:cursor-not-allowed',
                      isHour ? 'border-t border-t-slate-200' : 'border-t border-t-slate-100',
                      isSelected ? 'bg-brand-500 hover:bg-brand' : 'bg-white hover:bg-brand-50',
                    )}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
