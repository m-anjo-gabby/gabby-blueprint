'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Info, Search, SearchX, X } from 'lucide-react';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FAVORITE_LIMIT } from '@/constants/favorites';
import type { FavoriteKindDef } from './favoriteKinds';
import { ALL_OPTION, getDownstreamFilterIds, resolveFavoriteFilters } from './favoriteFilters';
import { FavoriteFilterChips, FavoriteFilterSelects, FavoriteFilterSheetButton } from './FavoriteFilterControls';
import { replaceSearchParams } from '@/lib/replaceSearchParams';

/** 画面の見出し（読み込み中の FavoritesSkeleton と共有する） */
export const FAVORITES_HEADER = { title: 'お気に入り', titleHidden: true } as const;

/** 一覧のグリッド（読み込み中の FavoritesSkeleton と共有する） */
export const getFavoriteGridClass = (columns: 1 | 2) => cn('grid gap-4', columns === 2 && 'lg:grid-cols-2');

/** 一度に表示する件数（「さらに表示」で追加する件数） */
const PAGE_SIZE = 50;

interface FavoriteKindSectionProps<T> {
  def: FavoriteKindDef<T>;
  items: T[];
  /** 種別切り替えのピル（固定ツールバーの先頭に置く） */
  pills: ReactNode;
  /** この種別が0件の時に空の表示に出す、登録のある他の種別への切り替え（無ければ null） */
  otherKindLinks: ReactNode;
  onRemove: (item: T) => void;
}

/**
 * 1種別分のお気に入り（固定ツールバーの検索・絞り込みと一覧）。
 * 絞り込みの状態は URL のクエリ（絞り込みID=値）で持ち、トレーニングから戻った時も条件を残す。
 * 検索語は入力途中の値のため URL には載せない。
 */
export function FavoriteKindSection<T>({ def, items, pills, otherKindLinks, onRemove }: FavoriteKindSectionProps<T>) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => Object.fromEntries(def.filters.map((f) => [f.id, searchParams.get(f.id)])),
    [def, searchParams]
  );
  const { filters, items: filteredByOptions } = useMemo(
    () => resolveFavoriteFilters(items, def.filters, selected),
    [def, items, selected]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? filteredByOptions.filter((item) => def.getSearchText(item).toLowerCase().includes(q)) : filteredByOptions;
  }, [def, filteredByOptions, query]);

  // 条件を変えたら表示件数を最初のページに戻す
  const conditionKey = `${filters.map((f) => f.value).join('|')}|${query}`;
  const [page, setPage] = useState({ key: conditionKey, count: PAGE_SIZE });
  const visibleCount = page.key === conditionKey ? page.count : PAGE_SIZE;
  const visible = filtered.slice(0, visibleCount);

  // 絞り込みを変えたら、連動して選択肢が変わる後ろの絞り込みは「すべて」に戻す
  const handleFilterChange = (filterId: string, value: string) => {
    replaceSearchParams(searchParams, (params) => {
      if (value === ALL_OPTION) params.delete(filterId);
      else params.set(filterId, value);
      getDownstreamFilterIds(def.filters, filterId).forEach((id) => params.delete(id));
    });
  };

  const clearFilterOptions = () => {
    replaceSearchParams(searchParams, (params) => def.filters.forEach((f) => params.delete(f.id)));
  };

  const isFiltering = query !== '' || filters.some((f) => f.value !== ALL_OPTION);
  const clearAll = () => {
    setQuery('');
    clearFilterOptions();
  };

  return (
    <>
      <ShellPageHeader {...FAVORITES_HEADER}>
        {pills}
        {items.length > 0 && (
          <>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle" size={18} />
                <Input
                  type="search"
                  placeholder={def.searchPlaceholder}
                  aria-label={`${def.noun}を検索`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  // iOSでのズーム防止のため text-base (16px)
                  className="h-11 rounded-control border-line bg-surface pl-11 text-base shadow-none transition-all focus-visible:border-brand-200 focus-visible:ring-brand/15 sm:text-sm"
                />
              </div>
              <FavoriteFilterSelects filters={filters} onChange={handleFilterChange} />
              <FavoriteFilterSheetButton
                filters={filters}
                onChange={handleFilterChange}
                onClearAll={clearFilterOptions}
                resultCount={filtered.length}
              />
            </div>
            <FavoriteFilterChips filters={filters} onChange={handleFilterChange} />
          </>
        )}
      </ShellPageHeader>

      {items.length >= FAVORITE_LIMIT && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          {`お気に入りの${def.noun}が上限（${FAVORITE_LIMIT.toLocaleString()}件）に達しています。新しく登録するには、不要なものを削除してください。`}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<def.icon size={28} className="text-ink-subtle" />} title={`お気に入りの${def.noun}はまだありません`}>
          <p className="text-sm text-ink-muted">{def.emptyHint}</p>
          {def.emptyAction && (
            <Button asChild variant="outline" className="mt-2 h-10 rounded-control border-line bg-surface text-sm font-semibold text-ink-soft shadow-none">
              <Link href={def.emptyAction.href}>{def.emptyAction.label}</Link>
            </Button>
          )}
          {otherKindLinks && <div className="mt-1 flex flex-wrap justify-center gap-1">{otherKindLinks}</div>}
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<SearchX size={28} className="text-ink-subtle" />} title={`条件に合う${def.noun}が見つかりません`}>
          {isFiltering && (
            <Button variant="ghost" onClick={clearAll} className="mt-1 h-10 rounded-control text-sm font-semibold text-brand hover:bg-brand-soft">
              <X size={16} className="mr-1" />
              条件をクリア
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className={getFavoriteGridClass(def.columns)}>
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((item) => (
                <motion.div
                  key={def.getKey(item)}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2 }}
                  className="h-full"
                >
                  {def.renderItem(item, () => onRemove(item))}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filtered.length > visible.length && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPage({ key: conditionKey, count: visibleCount + PAGE_SIZE })}
                className="h-11 rounded-control border-line bg-surface px-6 text-sm font-semibold text-ink-soft shadow-none"
              >
                さらに表示（残り{filtered.length - visible.length}件）
                <ChevronDown size={16} className="ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-24 text-center">
      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface">
        {icon}
      </div>
      <p className="text-base font-semibold text-ink-soft">{title}</p>
      {children}
    </div>
  );
}
