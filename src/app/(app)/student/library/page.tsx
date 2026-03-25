// src/app/(app)/student/library/page.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, BookOpen, ChevronLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// Components
import { ContentCard } from '@/components/student/ContentCard';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// Actions & Utils
import { getAllContent, toggleContentFavorite } from '@/actions/contentAction';
import { ContentItem, LIBRALY_TABS } from '@/types/content';
import { useToast } from '@/hooks/useToast';
import { getTrainingPath } from '@/utils/navigation';
import { Button } from '@/components/ui/button';

export default function LibraryPage() {
  const router = useRouter();
  const { showToast } = useToast();
  
  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter States
  const [selectedType, setSelectedType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');

  useEffect(() => {
    async function init() {
      const data = await getAllContent();
      setContentList(data);
      setLoading(false);
    }
    init();
  }, []);

  // フィルタリングロジック
  const filteredList = useMemo(() => {
    return contentList.filter(c => {
      const matchesSearch = c.content_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === 'All' || String(c.content_type) === selectedType;
      const matchesTag = selectedTag === 'All' || c.display_tags.some(t => t.tag_name === selectedTag);
      return matchesSearch && matchesType && matchesTag;
    });
  }, [contentList, searchQuery, selectedType, selectedTag]);

  const handleToggleFavorite = async (contentId: string, currentState: boolean) => {
    const nextState = !currentState;
    const contentName = contentList.find(c => c.content_id === contentId)?.content_name || '教材';

    // 1. 楽観的アップデート（即座にUIへ反映）
    setContentList(prev => 
      prev.map(c => c.content_id === contentId ? { ...c, is_favorite: nextState } : c)
    );

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
      setContentList(prev => 
        prev.map(c => c.content_id === contentId ? { ...c, is_favorite: currentState } : c)
      );
      
      console.error("Favorite Error:", error);
      showToast('お気に入りの更新に失敗しました。通信環境を確認してください。', 'error');
    }
  };

  return (
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      {/* 1. ヘッダーエリア */}
      <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.back()} 
              className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400"
            >
              <ChevronLeft size={24} />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Library</h1>
            </div>
          </div>
          
          {/* 個数表示バッジの微調整 */}
          <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 shadow-sm">
            {filteredList.length} <span className="opacity-60 ml-0.5">Items</span>
          </div>
        </div>

        {/* 検索バー：少しだけ白を強調して「浮かせ」ます */}
        <div className="flex gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-400 transition-colors" size={18} />
            <Input 
              placeholder="教材を検索..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-12 bg-white border-slate-100 shadow-sm rounded-2xl focus-visible:ring-indigo-500/20 focus-visible:border-indigo-200 transition-all"
            />
          </div>
          {/* リセットボタンがある場合は表示 */}
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

        {/* タブ：背景を少し落ち着かせ、アクティブなタブを強調 */}
        <Tabs value={selectedType} onValueChange={setSelectedType} className="w-full">
          <TabsList className="grid grid-cols-4 w-full h-12 bg-slate-100/50 rounded-2xl p-1.5 border border-slate-50">
            {LIBRALY_TABS.map(tab => {
              const count = contentList.filter(c => tab.id === 'All' || String(c.content_type) === String(tab.id)).length;
              return (
                <TabsTrigger 
                  key={tab.label} 
                  value={String(tab.id)} 
                  className="rounded-xl font-black text-[10px] uppercase tracking-wider transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm"
                >
                  {tab.label} <span className="ml-1 opacity-50 text-[8px]">({count})</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </header>

      {/* 2. リストエリア：背景を少しだけ濃くして、白いカードを際立たせます */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5 bg-slate-50/50">
        <AnimatePresence mode="popLayout">
          {loading ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-48 w-full rounded-[32px]" />
              </div>
            ))
          ) : filteredList.length > 0 ? (
            filteredList.map(content => (
              <ContentCard 
                key={content.content_id}
                content={content}
                onToggleFavorite={handleToggleFavorite}
                onStart={(c) => router.push(getTrainingPath(c))}
                actionMode='library'
              />
            ))
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-32 text-slate-400 space-y-4"
            >
              <div className="p-6 bg-white rounded-full shadow-sm border border-slate-100">
                <BookOpen size={48} strokeWidth={1} className="text-slate-200" />
              </div>
              <p className="font-bold text-sm tracking-tight">該当する教材が見つかりませんでした</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}