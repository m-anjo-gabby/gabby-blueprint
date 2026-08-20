'use client';

import { DayOfWeek, DAYS_OF_WEEK } from '@gabby/types/coachAvailability';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';
import { cn } from '@/lib/utils';

const SLOTS_PER_DAY = 48;

/** カレンダー上でクリック可能な1つのレッスン開始候補（25分レッスン、30分刻み） */
export interface AvailabilityCell {
  key: string;
  // 送信値：コーチのローカル時刻（DBの解釈基準）
  sourceDay: DayOfWeek;
  sourceStartTime: string; // "HH:MM"
  // 表示値：生徒のタイムゾーンに変換した曜日・時刻
  displayDay: DayOfWeek;
  displayStartTime: string; // "HH:MM"
  displayEndTime: string; // "HH:MM"
}

interface CoachAvailabilityCalendarProps {
  cells: AvailabilityCell[];
  selectedKey: string | null;
  onSelect: (cell: AvailabilityCell) => void;
}

function timeToSlotIndex(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 2 + (m >= 30 ? 1 : 0);
}

function slotIndexToLabel(slotIndex: number): string {
  const hour = Math.floor(slotIndex / 2).toString().padStart(2, '0');
  const minute = slotIndex % 2 === 0 ? '00' : '30';
  return `${hour}:${minute}`;
}

/**
 * コーチの空き時間をハイライト表示する読み取り専用の週間カレンダー。
 * セルをクリックするとそのままレッスン開始時刻の選択として確定する
 * （曜日チップ＋プルダウンの2段階選択に代わる、直感的な1ステップ操作）。
 */
export function CoachAvailabilityCalendar({ cells, selectedKey, onSelect }: CoachAvailabilityCalendarProps) {
  if (cells.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-10">現在、対応可能時間の登録がありません</p>;
  }

  const cellByDaySlot = new Map<string, AvailabilityCell>();
  let minSlot = SLOTS_PER_DAY;
  let maxSlot = 0;
  for (const cell of cells) {
    const slotIndex = timeToSlotIndex(cell.displayStartTime);
    cellByDaySlot.set(`${cell.displayDay}-${slotIndex}`, cell);
    if (slotIndex < minSlot) minSlot = slotIndex;
    if (slotIndex > maxSlot) maxSlot = slotIndex;
  }

  // 空き時間の前後1時間分だけ余白を持たせ、無駄な空行のスクロールを避ける
  const startSlot = Math.max(0, minSlot - 2);
  const endSlot = Math.min(SLOTS_PER_DAY - 1, maxSlot + 2);
  const slotRange = Array.from({ length: endSlot - startSlot + 1 }, (_, i) => startSlot + i);

  return (
    <div className="max-h-[360px] overflow-y-auto rounded-2xl border border-slate-200 select-none">
      <div className="grid" style={{ gridTemplateColumns: '44px repeat(7, minmax(0, 1fr))' }}>
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200" />
        {DAYS_OF_WEEK.map((day) => (
          <div
            key={day}
            className="sticky top-0 z-20 bg-white border-b border-slate-200 py-1.5 text-center text-[10px] font-black text-slate-500 tracking-wide"
          >
            {DAY_OF_WEEK_LABEL_JA[day].slice(0, 1)}
          </div>
        ))}

        {slotRange.map((slotIndex) => {
          const isHour = slotIndex % 2 === 0;
          return (
            <div key={slotIndex} className="contents">
              <div
                className={cn(
                  'h-[26px] pr-2 text-right text-[10px] text-slate-400 font-medium leading-[26px]',
                  isHour ? 'border-t border-slate-200' : 'border-t border-slate-100'
                )}
              >
                {isHour ? slotIndexToLabel(slotIndex) : ''}
              </div>
              {DAYS_OF_WEEK.map((day) => {
                const cell = cellByDaySlot.get(`${day}-${slotIndex}`);
                const isSelected = !!cell && cell.key === selectedKey;
                return (
                  <button
                    key={day}
                    type="button"
                    tabIndex={cell ? 0 : -1}
                    disabled={!cell}
                    onClick={() => cell && onSelect(cell)}
                    aria-pressed={isSelected}
                    aria-label={cell ? `${DAY_OF_WEEK_LABEL_JA[day]} ${cell.displayStartTime}` : undefined}
                    className={cn(
                      'h-[26px] border-l border-slate-100 transition-colors disabled:cursor-default',
                      isHour ? 'border-t border-t-slate-200' : 'border-t border-t-slate-100',
                      cell
                        ? isSelected
                          ? 'bg-indigo-600'
                          : 'bg-indigo-50 hover:bg-indigo-500 hover:text-white'
                        : 'bg-white'
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
