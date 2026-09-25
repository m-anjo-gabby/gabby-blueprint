'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, X, BookOpen, ChevronLeft, LayoutGrid } from 'lucide-react';
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
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      {/* 1. ヘッダーエリア */}
      <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link 
              href="/dashboard" 
              className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400"
            >
              <ChevronLeft size={24} />
            </Link>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Library</h1>
            </div>
          </div>
          
          <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 shadow-sm">
            {filteredList.length} <span className="opacity-60 ml-0.5">Items</span>
          </div>
        </div>

        {/* 検索バー */}
        <div className="flex gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-400 transition-colors" size={18} />
            <Input 
              placeholder="教材を検索..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              // iOSズーム防止の text-base
              className="pl-11 h-12 bg-white border-slate-100 shadow-sm rounded-2xl text-base sm:text-sm focus-visible:ring-indigo-500/20 focus-visible:border-indigo-200 transition-all"
            />
          </div>
          {(searchQuery || selectedType !== 'All' || selectedTag !== 'All') && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => { setSearchQuery(''); setSelectedType('All'); setSelectedTag('All'); }} 
              className="rounded-2xl hover:bg-rose-50 hover:text-rose-500 text-slate-400"
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
                      "group shrink-0 snap-start gap-1.5 whitespace-nowrap rounded-2xl border border-slate-100 bg-white px-4 h-11 font-black text-[11px] uppercase tracking-wider text-slate-500 shadow-none transition-all",
                      "data-[state=active]:border-indigo-600 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md"
                    )}
                  >
                    <Icon
                      size={14}
                      strokeWidth={2.5}
                      className={cn(config ? config.theme.text : "text-slate-400", "shrink-0 transition-colors group-data-[state=active]:text-white")}
                    />
                    {tab.label}
                    <span className="opacity-50 text-[9px] group-data-[state=active]:opacity-70">({count})</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* 続きがあることを示す端のフェード（スクロール可能な時のみ表示） */}
            {showLeftFade && (
              <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-white to-transparent" />
            )}
            {showRightFade && (
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-white to-transparent" />
            )}
          </div>
        </Tabs>
      </header>

      {/* 2. リストエリア */}
      <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 bg-slate-50/50">
        <AnimatePresence mode="popLayout">
          {isLoading && !allContents ? (
            <div className="space-y-5">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-[32px]" />
              ))}
            </div>
          ) : filteredList.length > 0 ? (
            <div className="space-y-5">
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
              className="flex flex-col items-center justify-center py-32 text-slate-400 space-y-4"
            >
              <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
                <BookOpen size={48} strokeWidth={1} className="text-slate-200" />
              </div>
              <p className="font-bold text-sm tracking-tight italic">No materials found</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}