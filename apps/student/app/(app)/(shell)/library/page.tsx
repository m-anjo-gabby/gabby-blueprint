'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, BookOpen, LayoutGrid } from 'lucide-react';
import { ShellPageHeader, CountBadge } from '@/components/shell/ShellPage';
import { AnimatePresence, motion } from 'framer-motion';

// Components
import { ContentCard } from '@/components/common/ContentCard';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from '@/components/ui/button';

// Actions & Hooks
import { toggleContentFavorite } from '@/actions/contentAction';
import { LIBRALY_TABS } from '@gabby/types/content';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useContentStore } from '@/stores/useContentStore';
import { getTrainingPath } from '@gabby/lib/navigation/student-path';
import { getContentTypeConfig } from '@gabby/lib/content/ui';
import { cn } from '@/lib/utils';

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

  // --- 種別タブ：横スクロールのフェード表示制御 ---
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateTabsFade = useCallback(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // --- Logic: データ取得（マウント時） ---
  useEffect(() => {
    fetchAllContents();
  }, [fetchAllContents]);

  // タブの件数表示が変わって幅が変化した場合にもフェード状態を再計算
  useEffect(() => {
    updateTabsFade();
    window.addEventListener('resize', updateTabsFade);
    return () => window.removeEventListener('resize', updateTabsFade);
  }, [updateTabsFade, allContents]);

  // 選択中タブが横スクロール範囲外にある場合、中央に自動スクロールする
  useEffect(() => {
    const activeTab = tabsScrollRef.current?.querySelector<HTMLElement>('[data-state="active"]');
    activeTab?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedType]);

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

    try {
      // 2. サーバーサイド処理
      await toggleContentFavorite(contentId, nextState);

      // 3. 成功時のトースト通知
      showToast(
        nextState 
          ? `「${contentName}」をお気に入りに追加しました` 
          : `「${contentName}」をお気に入りから解除しました`, 
        'success'
      );

    } catch (error) {
      // 4. エラー時のロールバック
      updateFavoriteStatus(contentId, currentState);
      console.error("Favorite Error:", error);
      showToast('更新に失敗しました。通信環境を確認してください。', 'error');
    }
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
        <Tabs value={selectedType} onValueChange={setSelectedType} className="w-full">
          <div className="relative -mx-1">
            <TabsList
              ref={tabsScrollRef}
              onScroll={updateTabsFade}
              className="flex h-auto w-full justify-start gap-2 overflow-x-auto scrollbar-none snap-x snap-proximity bg-transparent p-0 px-1"
            >
              {LIBRALY_TABS.map(tab => {
                const isAll = tab.id === 'All';
                const config = isAll ? null : getContentTypeConfig(Number(tab.id));
                const Icon = config?.icon ?? LayoutGrid;
                const count = allContents
                  ? allContents.filter(c => tab.id === 'All' || String(c.content_type) === String(tab.id)).length
                  : 0;
                return (
                  <TabsTrigger
                    key={tab.label}
                    value={String(tab.id)}
                    className={cn(
                      "group shrink-0 snap-start gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-4 h-10 text-sm font-semibold text-ink-soft shadow-none transition-all hover:border-brand-200",
                      "data-[state=active]:border-brand data-[state=active]:bg-brand data-[state=active]:text-white"
                    )}
                  >
                    <Icon
                      size={15}
                      className="shrink-0 text-ink-subtle transition-colors group-data-[state=active]:text-white"
                    />
                    {tab.label}
                    <span className="text-xs font-normal text-ink-muted group-data-[state=active]:text-white/70">{count}</span>
                  </TabsTrigger>
                );
              })}
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