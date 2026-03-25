'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ContentCard } from '@/components/student/ContentCard';
import { ContentItem, CONTENT_TYPES } from '@/types/content'; 
import { toggleContentFavorite } from '@/actions/contentAction';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { useFavoriteStore } from '@/stores/useFavoriteStore';
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
  const { contents, isLoadingContents, fetchContents, removeContent } = useFavoriteStore();

  // --- Local States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  // --- Logic: 初回データ取得 ---
  useEffect(() => {
    fetchContents();
  }, [fetchContents]);

  // --- Logic: フィルタリング用の教材種別リスト生成 ---
  const typeOptions = useMemo(() => {
    if (!contents) return [];
    const types = Array.from(new Set(contents.map(c => c.content_type)));
    return types.map(typeId => ({
      id: String(typeId),
      label: CONTENT_TYPES[typeId as keyof typeof CONTENT_TYPES]?.label || 'その他'
    }));
  }, [contents]);

  // --- Logic: 検索と種別フィルタの統合 ---
  const filteredContents = useMemo(() => {
    if (!contents) return [];
    return contents.filter(c => {
      const matchSearch = c.content_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchType = selectedType === 'all' || String(c.content_type) === selectedType;
      return matchSearch && matchType;
    });
  }, [contents, searchQuery, selectedType]);

  const handleRemoveFavorite = async (contentId: string) => {
    const ok = await showConfirm("Remove Course?", "お気に入りから削除しますか？", { variant: 'danger' });
    if (!ok) return;

    removeContent(contentId);
    try {
      await toggleContentFavorite(contentId, false);
      showToast('お気に入りから削除しました', 'success');
    } catch (error) {
      await fetchContents(true);
      showToast('削除に失敗しました', 'error');
    }
  };

  if (isLoadingContents && !contents) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* --- Filter Header --- */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-2 rounded-[24px] border border-slate-100 shadow-sm">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-400 transition-colors z-10" size={18} />
          <Input
            placeholder="Search materials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-12 bg-slate-50 border-none rounded-2xl text-base sm:text-sm font-bold focus-visible:ring-2 focus-visible:ring-indigo-500/20 transition-all"
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

      {/* --- Content Grid Area --- */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          {filteredContents.length > 0 ? (
            <motion.div key={selectedType + searchQuery} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-6">
              {filteredContents.map((content) => (
                <motion.div key={content.content_id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                  <ContentCard
                    content={content as unknown as ContentItem} 
                    actionMode="favorite"
                    onToggleFavorite={() => handleRemoveFavorite(content.content_id)}
                    onStart={(c) => router.push(getTrainingPath(c))}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div key="empty" className="py-32 text-center text-slate-400 font-bold text-sm">
              該当する教材が見つかりません
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}