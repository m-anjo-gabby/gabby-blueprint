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

  // 選択中のピルを横スクロールの中央に寄せる。
  // scrollIntoView はページ全体の縦スクロールまで動かすことがあるため、ピルの列だけをスクロールする
  const centerActive = useCallback((behavior: ScrollBehavior) => {
    const el = scrollRef.current;
    const active = el?.querySelector<HTMLElement>('[data-state="active"]');
    if (!el || !active) return;
    const listRect = el.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const offset = activeRect.left - listRect.left - (listRect.width - activeRect.width) / 2;
    el.scrollTo({ left: el.scrollLeft + offset, behavior });
  }, []);

  // 画面幅・フォント読み込み・件数表示の変化でピルの幅が変わった場合は、フェード状態を再計算し、
  // 選択中のピルが見切れていれば中央に寄せ直す（初回描画時は幅が確定する前に位置を計算することがあるため）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleResize = () => {
      const active = el.querySelector<HTMLElement>('[data-state="active"]');
      if (active) {
        const listRect = el.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        if (activeRect.left < listRect.left || activeRect.right > listRect.right) centerActive('auto');
      }
      updateFade();
    };
    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [updateFade, centerActive, items]);

  // 選択を変えたら中央に寄せる（初回表示は即座に、切り替え時はなめらかに）
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    centerActive(hasScrolledRef.current ? 'smooth' : 'auto');
    hasScrolledRef.current = true;
  }, [value, centerActive]);

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
