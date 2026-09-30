'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface PillTabItem<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** アイコンの色（教材種別などの分類色）。省略時はグレー */
  iconClassName?: string;
  /** ラベル横に出す件数。省略時は表示しない */
  count?: number;
}

interface PillTabsProps<T extends string> {
  items: readonly PillTabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  'aria-label'?: string;
}

/**
 * 画面内の表示切り替え・絞り込みを横スクロールのピルで表示するタブ（Radix Tabs）。
 * 項目が増えても崩れないよう、画面幅に収まらない分は横スクロールにし、続きがある側の端をフェードで示す。
 * ShellPageHeader の children（固定ツールバー）に置く前提で、フェード色は canvas に合わせている。
 */
export function PillTabs<T extends string>({ items, value, onValueChange, 'aria-label': ariaLabel }: PillTabsProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // 件数の表示が変わって幅が変化した場合にもフェード状態を再計算する
  useEffect(() => {
    updateFade();
    window.addEventListener('resize', updateFade);
    return () => window.removeEventListener('resize', updateFade);
  }, [updateFade, items]);

  // 選択中のピルが横スクロール範囲外にある場合、中央に自動スクロールする
  useEffect(() => {
    const active = scrollRef.current?.querySelector<HTMLElement>('[data-state="active"]');
    active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [value]);

  const handleValueChange = (next: string) => {
    const item = items.find((i) => i.value === next);
    if (item) onValueChange(item.value);
  };

  return (
    <Tabs value={value} onValueChange={handleValueChange} className="w-full">
      <div className="relative -mx-1">
        <TabsList
          ref={scrollRef}
          onScroll={updateFade}
          aria-label={ariaLabel}
          className="flex h-auto w-full justify-start gap-2 overflow-x-auto scrollbar-none snap-x snap-proximity bg-transparent p-0 px-1"
        >
          {items.map(({ value: itemValue, label, icon: Icon, iconClassName, count }) => (
            <TabsTrigger
              key={itemValue}
              value={itemValue}
              className={cn(
                'group shrink-0 snap-start gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-4 h-10 text-sm font-semibold text-ink-soft shadow-none transition-all hover:border-brand-200',
                'data-[state=active]:border-brand data-[state=active]:bg-brand data-[state=active]:text-white'
              )}
            >
              {Icon && (
                <Icon
                  size={15}
                  className={cn('shrink-0 transition-colors group-data-[state=active]:text-white', iconClassName ?? 'text-ink-subtle')}
                />
              )}
              {label}
              {count !== undefined && (
                <span className="text-xs font-normal text-ink-muted group-data-[state=active]:text-white/70">{count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* 続きがあることを示す端のフェード（スクロール可能な時のみ表示） */}
        {showLeftFade && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-canvas to-transparent" />
        )}
        {showRightFade && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-canvas to-transparent" />
        )}
      </div>
    </Tabs>
  );
}
