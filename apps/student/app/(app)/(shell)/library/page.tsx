'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, BookOpen, LayoutGrid } from 'lucide-react';
import { ShellPageHeader, CountBadge } from '@/components/shell/ShellPage';
import { AnimatePresence, motion } from 'framer-motion';

// Components
import { ContentCard } from '@/components/common/ContentCard';
import { PillTabs, type PillTabItem } from '@/components/shell/PillTabs';
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from '@/components/ui/button';

// Actions & Hooks
import { toggleContentFavorite } from '@/actions/contentAction';
import { FAVORITE_TOGGLE_NETWORK_ERROR, getFavoriteToggleErrorMessage } from '@/constants/favorites';
import { LIBRALY_TABS } from '@gabby/types/content';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useContentStore } from '@/stores/useContentStore';
import { getTrainingPath } from '@gabby/lib/navigation/student-path';
import { getContentTypeConfig } from '@gabby/lib/content/ui';

export default function LibraryPage() {
  const router = useRouter();
  const { showToast } = useToast();
  
  // --- Zustand Store ---
  // allContents: キャッシュされた全教材リスト
  // fetchAllContents: データ取得（既存キャッシュがあればスキップされる）
  // updateFavoriteStatus: お気に入り状態の即時更新（楽観的UI更新用）
  const { allContents, isLoading, fetchAllContents, updateFavoriteStatus } = useContentStore();
  
  // --- Filter States ---
  const [selectedType, setSelectedType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');

  // --- Logic: データ取得（マウント時） ---
  useEffect(() => {
    fetchAllContents();
  }, [fetchAllContents]);

  // 種別タブ（種別アイコンに分類色を付け、カード側のアイコン色との対応を覚えやすくする）
  const typeTabs = useMemo<PillTabItem<string>[]>(() => LIBRALY_TABS.map(tab => {
    const isAll = tab.id === 'All';
    const config = isAll ? null : getContentTypeConfig(Number(tab.id));
    return {
      value: String(tab.id),
      label: tab.label,
      icon: config?.icon ?? LayoutGrid,
      iconClassName: config?.theme.iconText,
      count: allContents
        ? allContents.filter(c => isAll || String(c.content_type) === String(tab.id)).length
        : 0,
    };
  }), [allContents]);

  // --- Logic: フィルタリングロジック ---
  const filteredList = useMemo(() => {
    if (!allContents) return [];
    return allContents.filter(c => {
      const matchesSearch = c.content_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === 'All' || String(c.content_type) === selectedType;
      const matchesTag = selectedTag === 'All' || c.display_tags.some(t => t.tag_name === selectedTag);
      return matchesSearch && matchesType && matchesTag;
    });
  }, [allContents, searchQuery, selectedType, selectedTag]);

  /**
   * お気に入り切り替えハンドラー
   * ストアの updateFavoriteStatus を使うことで、お気に入りタブと状態が完全同期される
   */
  const handleToggleFavorite = async (contentId: string, currentState: boolean) => {
    const nextState = !currentState;
    const content = allContents?.find(c => c.content_id === contentId);
    const contentName = content?.content_name || '教材';

    // 1. 楽観的アップデート（ストアの値を書き換える）
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
      <ShellPageHeader title="教材" aside={<CountBadge count={filteredList.length} />}>

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
          {(searchQuery || selectedType !== 'All' || selectedTag !== 'All') && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => { setSearchQuery(''); setSelectedType('All'); setSelectedTag('All'); }} 
              className="rounded-control text-ink-muted hover:bg-surface hover:text-ink"
            >
              <X size={20} />
            </Button>
          )}
        </div>

        {/* カテゴリタブ：教材種別の増加を見込み、固定グリッドではなく横スクロールpillで表現 */}
        <PillTabs items={typeTabs} value={selectedType} onValueChange={setSelectedType} aria-label="教材種別" />
      </ShellPageHeader>

      {/* 2. リストエリア（PCは2列） */}
      <div>
        <AnimatePresence mode="popLayout">
          {isLoading && !allContents ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-panel" />
              ))}
            </div>
          ) : filteredList.length > 0 ? (
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
                    actionMode='library'
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
              <div className="p-6 bg-surface rounded-full border border-line">
                <BookOpen size={48} strokeWidth={1} className="text-ink-subtle" />
              </div>
              <p className="text-sm font-semibold text-ink-muted">条件に合う教材が見つかりません</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}