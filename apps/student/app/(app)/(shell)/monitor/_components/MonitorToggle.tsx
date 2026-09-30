'use client';

import { useId } from 'react';
import { Switch } from '@/components/ui/switch';

interface MonitorToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** モニター用アカウントを一覧・集計・CSVに含めるかの切り替え */
export function MonitorToggle({ checked, onCheckedChange, disabled }: MonitorToggleProps) {
  const id = useId();

  return (
    <div className="flex h-10 shrink-0 items-center gap-2.5 self-start rounded-control border border-line bg-surface px-3.5 sm:self-auto">
      <label htmlFor={id} className="cursor-pointer text-sm font-semibold text-ink-soft select-none">
        モニターを含める
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
