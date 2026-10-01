'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, BookOpen, Star } from 'lucide-react';
import { ShellPageHeader, CountBadge } from '@/components/shell/ShellPage';
import { AnimatePresence, motion } from 'framer-motion';

// Components
import { ContentCard } from '@/components/common/ContentCard';
import { PillTabs } from '@/components/shell/PillTabs';
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { FavoriteOnlyToggle } from './FavoriteOnlyToggle';

// Actions & Hooks
import { toggleContentFavorite } from '@/actions/contentAction';
import { FAVORITE_TOGGLE_NETWORK_ERROR, getFavoriteToggleErrorMessage } from '@/constants/favorites';
import type { ContentItem } from '@gabby/types/content';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useServerSyncedState } from '@gabby/lib/hooks/useServerSyncedState';
import { useRefreshOnRestoredRender } from '@gabby/lib/hooks/useRefreshOnRestoredRender';
import { getTrainingPath } from '@gabby/lib/navigation/student-path';
import { replaceSearchParams } from '@/lib/replaceSearchParams';
import { buildTypeTabs } from '../_lib/typeTabs';

/** 種別タブと件数の行（読み込み中の LibrarySkeleton と共有する） */
export const LIBRARY_FILTER_ROW_CLASS = 'flex items-center gap-3';

/** 「お気に入りだけ表示」の URL のクエリ（ホーム等から絞り込んだ状態で開けるよう、URL で持つ） */
export const FAVORITE_ONLY_PARAM = 'favorite';
export const isFavoriteOnly = (params: { get(name: string): string | null }) => params.get(FAVORITE_ONLY_PARAM) === '1';

interface LibraryViewProps {
  /** サーバーで取得した教材一覧（開くたびに取得するため、他画面での変更や管理側の更新も反映される） */
  initialContents: ContentItem[];
  /** サーバー描画ごとのID（キャッシュ済みの画面の再利用を検知して取り直すために使う） */
  renderId: string;
}

/**
 * 教材一覧の本体（検索・種別・お気に入りの絞り込み、お気に入りの切り替え）。
 * お気に入りの教材は専用の画面を持たず、ここで「お気に入り」の絞り込みとして表示する。
 * データは page.tsx がサーバーで取得して渡し、画面内の変更（☆）はこの画面の状態だけを書き換える。
 */
export function LibraryView({ initialContents, renderId }: LibraryViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [allContents, setAllContents] = useServerSyncedState(initialContents);
  // 「戻る・進む」等でキャッシュ済みの画面が再利用された場合は、最新のデータに取り直す
  useRefreshOnRestoredRender(renderId);

  const updateFavoriteStatus = (contentId: string, isFavorite: boolean) => {
    setAllContents((prev) => prev.map((c) => (c.content_id === contentId ? { ...c, is_favorite: isFavorite } : c)));
  };

  // --- Filter States ---
  const [selectedType, setSelectedType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  // 検索・種別と違いURLで持つ（トレーニングから戻った時も残し、ホーム等から絞り込んだ状態で開けるようにする）
  const favoriteOnly = isFavoriteOnly(searchParams);
  const setFavoriteOnly = (next: boolean) => {
    replaceSearchParams(searchParams, (params) => {
      if (next) params.set(FAVORITE_ONLY_PARAM, '1');
      else params.delete(FAVORITE_ONLY_PARAM);
    });
  };

  // 種別タブの件数は、お気に入りで絞り込み中はお気に入りの中での件数にする
  const scopedContents = useMemo(
    () => (favoriteOnly ? allContents.filter((c) => c.is_favorite) : allContents),
    [allContents, favoriteOnly]
  );
  const typeTabs = useMemo(() => buildTypeTabs(scopedContents), [scopedContents]);

  // --- Logic: フィルタリングロジック ---
  const filteredList = useMemo(() => {
    return scopedContents.filter(c => {
      const matchesSearch = c.content_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === 'All' || String(c.content_type) === selectedType;
      const matchesTag = selectedTag === 'All' || c.display_tags.some(t => t.tag_name === selectedTag);
      return matchesSearch && matchesType && matchesTag;
    });
  }, [scopedContents, searchQuery, selectedType, selectedTag]);

  /**
   * お気に入り切り替えハンドラー（楽観的に☆を切り替え、失敗したら戻す）。
   * お気に入り画面は開くたびにサーバーで取得するため、他画面への反映処理は不要
   */
  const handleToggleFavorite = async (contentId: string, currentState: boolean) => {
    const nextState = !currentState;
    const content = allContents.find(c => c.content_id === contentId);
    const contentName = content?.content_name || '教材';

    // 1. 楽観的アップデート
    updateFavoriteStatus(contentId, nextState);

    // 2. サーバーサイド処理（登録上限の超過・失敗は戻り値で返る）
    const result = await toggleContentFavorite(contentId, nextState).catch(() => FAVORITE_TOGGLE_NETWORK_ERROR);
    if (!result.ok) {
      // 3. 失敗時のロールバック
      updateFavoriteStatus(contentId, currentState);
      showToast(getFavoriteToggleErrorMessage(result), 'error');
      return;
    }

    // 4. 成功時のトースト通知
    showToast(
      nextState 
        ? `「${contentName}」をお気に入りに追加しました` 
        : `「${contentName}」をお気に入りから解除しました`, 
      'success'
    );
  };

  return (
    <>
      {/* 1. ヘッダーエリア（検索・種別タブはスクロールしても上部に固定） */}
      <ShellPageHeader title="教材" titleHidden>

        {/* 検索バー */}
        <div className="flex gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle group-focus-within:text-brand transition-colors" size={18} />
            <Input 
              placeholder="教材を検索..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              // iOSズーム防止の text-base
              className="pl-11 h-12 bg-surface border-line shadow-none rounded-control text-base sm:text-sm focus-visible:ring-brand/15 focus-visible:border-brand-200 transition-all"
            />
          </div>
          <FavoriteOnlyToggle pressed={favoriteOnly} onPressedChange={setFavoriteOnly} />
          {(searchQuery || selectedType !== 'All' || selectedTag !== 'All' || favoriteOnly) && (
            <Button 
              variant="ghost" 
              size="icon" 
              aria-label="条件をクリア"
              onClick={() => { setSearchQuery(''); setSelectedType('All'); setSelectedTag('All'); setFavoriteOnly(false); }} 
              className="rounded-control text-ink-muted hover:bg-surface hover:text-ink"
            >
              <X size={20} />
            </Button>
          )}
        </div>

        {/* カテゴリタブ：教材種別の増加を見込み、固定グリッドではなく横スクロールpillで表現。
            件数は絞り込みで変わるため、絞り込みの横に置く */}
        <div className={LIBRARY_FILTER_ROW_CLASS}>
          <div className="min-w-0 flex-1">
            <PillTabs items={typeTabs} value={selectedType} onValueChange={setSelectedType} aria-label="教材種別" />
          </div>
          <CountBadge count={filteredList.length} />
        </div>
      </ShellPageHeader>

      {/* 2. リストエリア（PCは2列） */}
      {/* カードをフェードインさせない（骨組みから本番へ、その場で置き換わるようにする）。
          絞り込み時の並び替え（layout）と、該当なし表示の出入りは動かす */}
      <div>
        <AnimatePresence mode="popLayout" initial={false}>
          {filteredList.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredList.map(content => (
                <motion.div
                  key={content.content_id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="h-full"
                >
                  <ContentCard 
                    content={content}
                    onToggleFavorite={handleToggleFavorite}
                    onStart={(c) => router.push(getTrainingPath(c))}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-32 text-ink-subtle space-y-4"
            >
              {favoriteOnly && scopedContents.length === 0 ? (
                <>
                  <div className="p-6 bg-surface rounded-full border border-line">
                    <Star size={48} strokeWidth={1} className="text-ink-subtle" />
                  </div>
                  <div className="space-y-1 text-center">
                    <p className="text-sm font-semibold text-ink-muted">お気に入りの教材はまだありません</p>
                    <p className="text-sm text-ink-muted">教材カードの☆から登録できます</p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => setFavoriteOnly(false)}
                    className="h-10 rounded-control text-sm font-semibold text-brand hover:bg-brand-soft"
                  >
                    すべての教材を見る
                  </Button>
                </>
              ) : (
                <>
                  <div className="p-6 bg-surface rounded-full border border-line">
                    <BookOpen size={48} strokeWidth={1} className="text-ink-subtle" />
                  </div>
                  <p className="text-sm font-semibold text-ink-muted">条件に合う教材が見つかりません</p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}