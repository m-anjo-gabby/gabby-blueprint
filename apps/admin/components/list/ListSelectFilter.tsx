'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** 「すべて」を表す選択肢の値（Radix の Select は空文字の値を持てないため） */
const ALL = '__all__';

export interface FilterOption {
  value: string;
  label: string;
}

interface ListSelectFilterProps {
  /** 絞り込みの名前（読み上げ用） */
  label: string;
  /** 「すべて」の表示名 */
  allLabel: string;
  options: readonly FilterOption[];
  /** 選択中の値（空文字 = すべて） */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** 一覧の絞り込み（選択肢から1つ選ぶ）。ListToolbar の children に置く */
export function ListSelectFilter({ label, allLabel, options, value, onChange, className }: ListSelectFilterProps) {
  // 選択中の表示名は自前で渡す（Radix は操作可能になるまで表示名を描かず、読み込み直後に空欄が見えるため）
  const selectedLabel = options.find((option) => option.value === value)?.label ?? allLabel;
  return (
    <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? '' : next)}>
      <SelectTrigger aria-label={label} className={cn('h-9 w-40 shrink-0 bg-white', className)}>
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
