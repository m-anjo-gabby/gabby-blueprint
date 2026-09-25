/**
 * 画面内の表示切り替え（Radix Tabs）をセグメント型で表示するための共通クラス。
 * TabsList / TabsTrigger の className に指定する。
 */
export const SEGMENTED_TABS_LIST_CLASS = 'h-11 w-full rounded-control bg-slate-100 p-1';

export const SEGMENTED_TABS_TRIGGER_CLASS =
  'h-full flex-1 rounded-[calc(var(--radius-control)-0.25rem)] text-sm font-semibold text-ink-muted transition-all data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm';
