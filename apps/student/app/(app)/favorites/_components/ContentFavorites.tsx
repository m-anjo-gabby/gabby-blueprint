'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Inbox } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// Components
import { ContentCard } from '@/components/student/ContentCard';
import { ContentItem, CONTENT_TYPES } from '@/types/content'; 
import { toggleContentFavorite } from '@/actions/contentAction';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { useContentStore } from '@/stores/useContentStore'; // 新しいストア
import { getTrainingPath } from '@/utils/navigation';

// shadcn components
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ContentFavorites() {
  const router = useRouter();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // --- Zustand Store ---
  // allContents (全教材) からお気に入りだけを抽出する設計
  const { allContents, isLoading, fetchAllContents, updateFavoriteStatus } = useContentStore();

  // --- Local States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  // --- Logic: データ取得（マウント時） ---
  useEffect(() => {
    fetchAllContents();
  }, [fetchAllContents]);

  // --- Logic: お気に入り登録されている教材のみを抽出 ---
  const favoriteContents = useMemo(() => {
    return allContents?.filter(c => c.is_favorite) ?? [];
  }, [allContents]);

  // --- Logic: フィルタリング用の教材種別リスト生成 ---
  const typeOptions = useMemo(() => {
    const types = Array.from(new Set(favoriteContents.map(c => c.content_type)));
    return types.map(typeId => ({
      id: String(typeId),
      label: CONTENT_TYPES[typeId as keyof typeof CONTENT_TYPES]?.label || 'その他'
    }));
  }, [favoriteContents]);

  // --- Logic: 表示データの絞り込み（検索 + 種別） ---
  const filteredContents = useMemo(() => {
    return favoriteContents.filter(c => {
      const matchSearch = c.content_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchType = selectedType === 'all' || String(c.content_type) === selectedType;
      return matchSearch && matchType;
    });
  }, [favoriteContents, searchQuery, selectedType]);

  /**
   * お気に入り解除ハンドラー
   * ストアの updateFavoriteStatus を使用して、Library側とも同期させる
   */
  const handleRemoveFavorite = async (contentId: string) => {
    const ok = await showConfirm(
      "Remove Course?", 
      "この教材をお気に入りから削除しますか？", 
      { variant: 'danger' }
    );
    if (!ok) return;

    // 1. 楽観的UI更新（リストから即座に消える）
    updateFavoriteStatus(contentId, false);

    try {
      // 2. サーバーサイド処理
      await toggleContentFavorite(contentId, false);
      showToast('お気に入りから削除しました', 'success');
    } catch (error) {
      // 3. 失敗時は再取得して整合性を戻す
      await fetchAllContents(true);
      showToast('削除に失敗しました', 'error');
    }
  };

  // --- Render: Loading ---
  if (isLoading && !allContents) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Favorites...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* --- Filter Header: iPhoneでの操作性を重視した高さ48px設計 --- */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-2 rounded-[24px] border border-slate-100 shadow-sm">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-400 transition-colors z-10" size={18} />
          <Input
            placeholder="Search favorites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            // iOSでのズーム防止のため text-base (16px) を適用
            className="pl-11 h-12 bg-slate-50 border-none rounded-2xl text-base sm:text-sm font-bold focus-visible:ring-2 focus-visible:ring-indigo-500/20 transition-all placeholder:text-slate-300"
          />
        </div>

        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-full sm:w-[180px] h-12 bg-slate-50 border-none rounded-2xl text-[11px] font-black uppercase tracking-wider focus:ring-2 focus:ring-indigo-500/20 text-slate-600 px-4">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl border-slate-100 shadow-xl">
            <SelectItem value="all" className="text-[11px] font-black uppercase tracking-wider">All Types</SelectItem>
            {typeOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id} className="text-[11px] font-black uppercase tracking-wider">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* --- Content List Area: 外枠なしのカード直列レイアウト --- */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="popLayout">
          {filteredContents.length > 0 ? (
            <div className="grid gap-5">
              {filteredContents.map((content) => (
                <motion.div
                  key={content.content_id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <ContentCard
                    content={content} 
                    actionMode="favorite"
                    onToggleFavorite={() => handleRemoveFavorite(content.content_id)}
                    onStart={(c) => router.push(getTrainingPath(c))}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div 
              key="empty" 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-32 text-center space-y-4"
            >
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-slate-50">
                <Inbox className="text-slate-200" size={32} />
              </div>
              <p className="text-slate-400 font-bold text-sm tracking-wide">
                {searchQuery ? '該当する教材が見つかりません' : 'お気に入り教材はありません'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}