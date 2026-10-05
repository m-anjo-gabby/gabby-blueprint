'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ALL_OPTION, type ResolvedFilter } from './favoriteFilters';

interface FavoriteFilterControlsProps {
  filters: ResolvedFilter[];
  onChange: (filterId: string, value: string) => void;
  onClearAll: () => void;
  /** 絞り込み・検索後の件数（シートの「◯件を表示」に出す） */
  resultCount: number;
}

const activeCount = (filters: ResolvedFilter[]) => filters.filter((f) => f.value !== ALL_OPTION).length;

const optionLabel = (filter: ResolvedFilter) =>
  filter.options.find((o) => o.id === filter.value)?.label ?? filter.allLabel;

/** PC（md以上）: 検索欄の横に並べるセレクト */
export function FavoriteFilterSelects({ filters, onChange }: Pick<FavoriteFilterControlsProps, 'filters' | 'onChange'>) {
  if (filters.length === 0) return null;
  return (
    <>
      {filters.map((filter) => (
        <Select key={filter.id} value={filter.value} onValueChange={(v) => onChange(filter.id, v)}>
          <SelectTrigger
            aria-label={filter.label}
            className="hidden h-11! w-48 shrink-0 rounded-control border-line bg-surface text-sm shadow-none md:flex"
          >
            <SelectValue>{optionLabel(filter)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>{filter.allLabel}</SelectItem>
            {filter.options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
                <span className="ml-1.5 text-xs text-ink-muted">{o.count}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </>
  );
}

/** モバイル（md未満）: 「絞り込み」ボタンと、下から開くシート */
export function FavoriteFilterSheetButton({ filters, onChange, onClearAll, resultCount }: FavoriteFilterControlsProps) {
  const [open, setOpen] = useState(false);
  if (filters.length === 0) return null;
  const count = activeCount(filters);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={count > 0 ? `絞り込み（${count}件の条件を指定中）` : '絞り込み'}
        className={cn(
          'h-11 shrink-0 gap-1.5 rounded-control border-line bg-surface px-3.5 text-sm font-semibold text-ink-soft shadow-none md:hidden',
          count > 0 && 'border-brand-200 text-brand'
        )}
      >
        <SlidersHorizontal size={16} />
        絞り込み
        {count > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-white">{count}</span>
        )}
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto max-h-[85vh] max-w-2xl rounded-t-panel border-line bg-surface">
          <DrawerHeader className="px-5 pb-2 pt-3 text-left">
            <DrawerTitle className="text-lg font-bold text-ink">絞り込み</DrawerTitle>
            <DrawerDescription className="sr-only">表示するお気に入りの条件を選びます</DrawerDescription>
          </DrawerHeader>

          <div className="space-y-5 overflow-y-auto px-5 py-2" data-vaul-no-drag>
            {filters.map((filter) => (
              <section key={filter.id} aria-label={filter.label}>
                <h3 className="mb-2 text-sm font-semibold text-ink-soft">{filter.label}</h3>
                <div className="flex flex-wrap gap-2">
                  <ChoiceChip selected={filter.value === ALL_OPTION} onClick={() => onChange(filter.id, ALL_OPTION)}>
                    すべて
                  </ChoiceChip>
                  {filter.options.map((o) => (
                    <ChoiceChip key={o.id} selected={filter.value === o.id} onClick={() => onChange(filter.id, o.id)}>
                      {o.label}
                      <span className="text-xs font-normal opacity-70">{o.count}</span>
                    </ChoiceChip>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <DrawerFooter className="flex-row gap-2 border-t border-line px-5 pb-6 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onClearAll}
              disabled={count === 0}
              className="h-12 flex-1 rounded-control text-sm font-semibold text-ink-soft"
            >
              条件をクリア
            </Button>
            <Button
              type="button"
              onClick={() => setOpen(false)}
              className="h-12 flex-[2] rounded-control bg-brand text-sm font-bold text-white hover:bg-brand-strong"
            >
              {resultCount}件を表示
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** モバイル（md未満）: 指定中の条件のチップ（×でその条件と、連動する後ろの条件を外す） */
export function FavoriteFilterChips({ filters, onChange }: Pick<FavoriteFilterControlsProps, 'filters' | 'onChange'>) {
  const active = filters.filter((f) => f.value !== ALL_OPTION);
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 md:hidden">
      {active.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={() => onChange(filter.id, ALL_OPTION)}
          aria-label={`${filter.label}「${optionLabel(filter)}」の条件を外す`}
          className="flex h-8 items-center gap-1 rounded-full border border-brand-200 bg-brand-soft pl-3 pr-2 text-xs font-semibold text-brand transition-colors hover:bg-brand-100"
        >
          <span className="text-brand/70">{filter.label}:</span>
          {optionLabel(filter)}
          <X size={14} />
        </button>
      ))}
    </div>
  );
}

function ChoiceChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors',
        selected ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-soft hover:border-brand-200'
      )}
    >
      {children}
    </button>
  );
}
