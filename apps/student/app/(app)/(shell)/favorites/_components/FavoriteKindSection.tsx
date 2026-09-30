'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, SearchX, X } from 'lucide-react';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { FavoriteGroup, FavoriteKindDef } from './favoriteKinds';

const ALL_GROUPS = 'all';

interface FavoriteKindSectionProps<T> {
  def: FavoriteKindDef<T>;
  items: T[];
  /** 種別切り替えのピル（固定ツールバーの先頭に置く） */
  pills: ReactNode;
  onRemove: (item: T) => void;
}

/** 1種別分のお気に入り（固定ツールバーの検索・絞り込みと一覧） */
export function FavoriteKindSection<T>({ def, items, pills, onRemove }: FavoriteKindSectionProps<T>) {
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState(ALL_GROUPS);

  // 絞り込みの選択肢は、登録済みの項目に含まれる分類だけを出す
  const groups = useMemo(() => {
    const map = new Map<string, FavoriteGroup>();
    items.forEach((item) => {
      const group = def.getGroup(item);
      if (!map.has(group.id)) map.set(group.id, group);
    });
    return Array.from(map.values());
  }, [def, items]);

  // 絞り込み中の分類が削除で無くなった場合は「すべて」に戻す
  const activeGroupId = groups.some((g) => g.id === groupId) ? groupId : ALL_GROUPS;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) =>
      (activeGroupId === ALL_GROUPS || def.getGroup(item).id === activeGroupId) &&
      (!q || def.getSearchText(item).toLowerCase().includes(q))
    );
  }, [def, items, query, activeGroupId]);

  const isFiltering = query !== '' || activeGroupId !== ALL_GROUPS;
  const clearFilters = () => {
    setQuery('');
    setGroupId(ALL_GROUPS);
  };

  return (
    <>
      <ShellPageHeader title="お気に入り" back={{ history: '/dashboard' }}>
        {pills}
        {items.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
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
            {groups.length > 1 && (
              <Select value={activeGroupId} onValueChange={setGroupId}>
                <SelectTrigger
                  aria-label="絞り込み"
                  className="h-11! w-full rounded-control border-line bg-surface text-sm shadow-none sm:w-56"
                >
                  <SelectValue>
                    {groups.find((g) => g.id === activeGroupId)?.label ?? def.allGroupsLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_GROUPS}>{def.allGroupsLabel}</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </ShellPageHeader>

      {items.length === 0 ? (
        <EmptyState icon={<def.icon size={28} className="text-ink-subtle" />} title={`お気に入りの${def.noun}はまだありません`}>
          <p className="text-sm text-ink-muted">{def.emptyHint}</p>
          {def.emptyAction && (
            <Button asChild variant="outline" className="mt-2 h-10 rounded-control border-line bg-surface text-sm font-semibold text-ink-soft shadow-none">
              <Link href={def.emptyAction.href}>{def.emptyAction.label}</Link>
            </Button>
          )}
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<SearchX size={28} className="text-ink-subtle" />} title={`条件に合う${def.noun}が見つかりません`}>
          {isFiltering && (
            <Button variant="ghost" onClick={clearFilters} className="mt-1 h-10 rounded-control text-sm font-semibold text-brand hover:bg-brand-soft">
              <X size={16} className="mr-1" />
              条件をクリア
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className={cn('grid gap-4', def.columns === 2 && 'lg:grid-cols-2')}>
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map((item) => (
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
