'use client';

import { Circle, Info, Triangle, X } from 'lucide-react';
import { DayOfWeek, DAYS_OF_WEEK } from '@gabby/types/coachAvailability';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const SLOTS_PER_DAY = 48;

/**
 * 候補ごとの申請の可否（契約期間内に予約できる回数で決まる）。
 * full: 全ての回を予約できる / partial: 割合以上は予約でき、残りはコーチと個別に調整 / unavailable: 申請できない
 */
export type AvailabilityCellState = 'full' | 'partial' | 'unavailable';

/** カレンダー上でクリック可能な1つのセッション開始候補（25分セッション、30分刻み） */
export interface AvailabilityCell {
  key: string;
  // 空き時間の基準（UTC）の曜日・時刻
  sourceDay: DayOfWeek;
  sourceStartTime: string; // "HH:MM"
  // 表示値・送信値：生徒のタイムゾーンに変換した曜日・時刻（申請は生徒の現地時刻で送る）
  displayDay: DayOfWeek;
  displayStartTime: string; // "HH:MM"
  displayEndTime: string; // "HH:MM"
}

interface CoachAvailabilityCalendarProps {
  cells: AvailabilityCell[];
  // セルのkeyごとの申請の可否。取得中はnull（全てのセルを選択不可で表示する）
  cellStates: Map<string, AvailabilityCellState> | null;
  selectedKey: string | null;
  onSelect: (cell: AvailabilityCell) => void;
}

const STATE_LABEL: Record<AvailabilityCellState, string> = {
  full: '申請可能',
  partial: '申請可能（一部の回は個別に調整）',
  unavailable: '受付終了',
};

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
 * セルをクリックするとそのままセッション開始時刻の選択として確定する
 * （曜日チップ＋プルダウンの2段階選択に代わる、直感的な1ステップ操作）。
 */
export function CoachAvailabilityCalendar({ cells, cellStates, selectedKey, onSelect }: CoachAvailabilityCalendarProps) {
  if (cells.length === 0) {
    return <p className="text-xs text-ink-subtle text-center py-10">現在、対応可能時間の登録がありません</p>;
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
    // モバイルの全画面のダイアログでは、凡例・選んだ枠の内容がカレンダーの下に見えるよう、高さを画面の約4割にする
    <div className="max-h-[40dvh] sm:max-h-[360px] overflow-y-auto rounded-control border border-line select-none" aria-busy={cellStates === null}>
      <div className="grid" style={{ gridTemplateColumns: '44px repeat(7, minmax(0, 1fr))' }}>
        <div className="sticky top-0 z-20 bg-white border-b border-line" />
        {DAYS_OF_WEEK.map((day) => (
          <div
            key={day}
            className="sticky top-0 z-20 bg-white border-b border-line py-1.5 text-center text-[11px] font-bold text-ink-muted"
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
                  'h-[26px] pr-2 text-right text-[11px] text-ink-subtle font-medium leading-[26px]',
                  isHour ? 'border-t border-line' : 'border-t border-line/70'
                )}
              >
                {isHour ? slotIndexToLabel(slotIndex) : ''}
              </div>
              {DAYS_OF_WEEK.map((day) => {
                const cell = cellByDaySlot.get(`${day}-${slotIndex}`);
                const isSelected = !!cell && cell.key === selectedKey;
                const isLoading = !!cell && cellStates === null;
                const state = cell && cellStates ? (cellStates.get(cell.key) ?? 'unavailable') : null;
                const isUnavailable = state === 'unavailable';
                const isPartial = state === 'partial';
                const isSelectable = !!cell && !!state && !isUnavailable;
                return (
                  <button
                    key={day}
                    type="button"
                    tabIndex={isSelectable ? 0 : -1}
                    disabled={!isSelectable}
                    onClick={() => isSelectable && onSelect(cell)}
                    aria-pressed={isSelected}
                    aria-label={
                      cell && state
                        ? `${DAY_OF_WEEK_LABEL_JA[day]} ${cell.displayStartTime} ${STATE_LABEL[state]}`
                        : undefined
                    }
                    className={cn(
                      'h-[26px] border-l border-line/70 transition-colors disabled:cursor-default flex items-center justify-center',
                      isHour ? 'border-t border-t-line' : 'border-t border-t-line/60',
                      isLoading
                        ? 'bg-skeleton animate-pulse'
                        : isUnavailable
                          ? 'bg-canvas text-ink-subtle'
                          : cell
                            ? isSelected
                              ? 'bg-brand text-white'
                              : isPartial
                                ? 'bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white'
                                : 'bg-brand-soft text-brand-500 hover:bg-brand-500 hover:text-white'
                            : 'bg-white'
                    )}
                  >
                    {isUnavailable && <X size={15} strokeWidth={3} aria-hidden="true" />}
                    {isSelectable && !isPartial && <Circle size={13} strokeWidth={3} aria-hidden="true" />}
                    {isSelectable && isPartial && <Triangle size={13} strokeWidth={3} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 凡例の記号（カレンダーのセルと同じ見た目） */
function LegendMark({ state }: { state: AvailabilityCellState }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-5 items-center justify-center border border-line/70',
        state === 'full' && 'bg-brand-soft text-brand-500',
        state === 'partial' && 'bg-amber-50 text-amber-600',
        state === 'unavailable' && 'bg-canvas text-ink-subtle'
      )}
    >
      {state === 'full' && <Circle size={11} strokeWidth={3} />}
      {state === 'partial' && <Triangle size={11} strokeWidth={3} />}
      {state === 'unavailable' && <X size={12} strokeWidth={3} />}
    </span>
  );
}

const LEGEND_ITEMS: { state: AvailabilityCellState; label: string }[] = [
  { state: 'full', label: '全回予約可' },
  { state: 'partial', label: '一部は個別調整' },
  { state: 'unavailable', label: '受付終了' },
];

/**
 * カレンダーの凡例（グラフの凡例のように、記号と短い名前だけを1行で並べる）。
 * 補足（△・×の意味）は ⓘ を押したときだけ吹き出しで出す。
 */
export function AvailabilityLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-muted">
      {LEGEND_ITEMS.map((item) => (
        <span key={item.state} className="inline-flex items-center gap-1">
          <LegendMark state={item.state} />
          {item.label}
        </span>
      ))}
      <Popover>
        <PopoverTrigger
          aria-label="記号の説明"
          className="inline-flex size-6 items-center justify-center rounded-full text-ink-subtle hover:bg-canvas hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
        >
          <Info size={14} />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-2 text-xs leading-relaxed text-ink-soft">
          <p>
            <span className="font-bold">〇</span> 契約期間内の全ての回を予約できます。
          </p>
          <p>
            <span className="font-bold">△</span> 一部の回がコーチまたはあなたの他の予定と重なります。重なる回は未予約になり、マッチング成立後にコーチと個別に日時を調整します。
          </p>
          <p>
            <span className="font-bold">×</span> 他の予定や他の方のリクエストと重なる回が多く、リクエストできません。
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
