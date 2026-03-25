'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Star } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { toggleFavorite } from '@/actions/wordAction';
import { usePhraseStore } from '@/stores/usePhraseStore'; // 分離したPhrase専用ストア
import { PhraseFavoriteItem } from './PhraseFavoriteItem';

// shadcn components
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function PhraseFavorites() {
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // --- Zustand Store ---
  // favoritePhrases: お気に入りフレーズのリスト
  // removeFavorite: キャッシュから即座に削除するアクション
  const { favoritePhrases, isLoading, fetchFavorites, removeFavorite } = usePhraseStore();

  // --- Local States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContentId, setSelectedContentId] = useState<string>('all');

  // --- Logic: 初回データ取得 ---
  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // --- Logic: フィルタリング用の教材リスト生成 ---
  // どのお気に入りがどの教材に紐づいているかを抽出
  const contentOptions = useMemo(() => {
    if (!favoritePhrases) return [];
    const map = new Map();
    favoritePhrases.forEach(f => {
      if (!map.has(f.content_id)) {
        map.set(f.content_id, f.content_name);
      }
    });
    return Array.from(map.entries());
  }, [favoritePhrases]);

  // --- Logic: 検索(日・英)と教材フィルタの統合 ---
  const filteredPhrases = useMemo(() => {
    if (!favoritePhrases) return [];
    return favoritePhrases.filter(f => {
      const matchSearch = f.phrase_en.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          f.phrase_ja.includes(searchQuery);
      const matchContent = selectedContentId === 'all' || f.content_id === selectedContentId;
      return matchSearch && matchContent;
    });
  }, [favoritePhrases, searchQuery, selectedContentId]);

  /**
   * お気に入り解除ハンドラー
   */
  const handleRemoveClick = async (phraseId: string) => {
    const ok = await showConfirm(
      "Remove Phrase?", 
      "このフレーズをお気に入りから削除しますか？", 
      { variant: 'danger' }
    );
    if (!ok) return;

    // 1. 楽観的UI更新（リストから即座に消去）
    removeFavorite(phraseId);

    try {
      // 2. サーバーサイド処理
      await toggleFavorite(phraseId, false);
      showToast('お気に入りから削除しました', 'success');
    } catch (error) {
      // 3. 失敗時は再取得して整合性を戻す
      await fetchFavorites(true);
      showToast('削除に失敗しました', 'error');
    }
  };

  // --- Render: Loading ---
  if (isLoading && !favoritePhrases) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Phrases...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* --- Filter Header --- */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-2 rounded-[24px] border border-slate-100 shadow-sm">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-400 transition-colors z-10" size={18} />
          <Input
            placeholder="Search phrases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            // iOSズーム防止の text-base
            className="pl-11 h-12 bg-slate-50 border-none rounded-2xl text-base sm:text-sm font-bold focus-visible:ring-2 focus-visible:ring-indigo-500/20 transition-all placeholder:text-slate-300"
          />
        </div>

        <Select value={selectedContentId} onValueChange={setSelectedContentId}>
          <SelectTrigger className="w-full sm:w-[200px] h-12 bg-slate-50 border-none rounded-2xl text-[11px] font-black uppercase tracking-wider focus:ring-2 focus:ring-indigo-500/20 text-slate-600 px-4">
            <SelectValue placeholder="All Materials" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl border-slate-100 shadow-xl">
            <SelectItem value="all" className="text-[11px] font-black uppercase tracking-wider">All Materials</SelectItem>
            {contentOptions.map(([id, name]) => (
              <SelectItem key={id} value={id} className="text-[11px] font-black uppercase tracking-wider">
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* --- List Area --- */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="popLayout">
          {filteredPhrases.length > 0 ? (
            <div className="grid gap-4">
              {filteredPhrases.map((phrase) => (
                <motion.div
                  key={phrase.phrase_id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <PhraseFavoriteItem 
                    phrase={phrase} 
                    onRemove={handleRemoveClick} 
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div 
              key="empty" 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-32 text-center space-y-4"
            >
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-slate-50">
                <Star className="text-slate-200" size={32} />
              </div>
              <p className="text-slate-400 font-bold text-sm tracking-wide">
                {searchQuery ? '該当するフレーズが見つかりません' : 'お気に入りフレーズはありません'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}