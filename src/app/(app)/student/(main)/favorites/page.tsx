'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toggleFavorite, getFavoritePhrases } from '@/actions/corpusAction';
import { ChevronLeft, Star, Volume2, Trash2 } from 'lucide-react';
import { FavoritePhraseRecord } from '@/types/training';
import { useVoice } from '@/hooks/useVoice';
import { useToast } from '@/hooks/useToast';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * お気に入りフレーズ一覧ページ
 * 役割:
 * 1. ユーザーが保存した全フレーズのリスト表示
 * 2. 教材（コーパス）ごとのフィルタリング
 * 3. 音声再生、およびお気に入り解除
 */
export default function FavoritePage() {
  const router = useRouter();
  const { speak } = useVoice();
  const { showToast } = useToast();

  // --- States ---
  const [favorites, setFavorites] = useState<FavoritePhraseRecord[]>([]);
  const [selectedCorpusId, setSelectedCorpusId] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // --- Data Fetching ---
  useEffect(() => {
    async function load() {
      try {
        const data = await getFavoritePhrases();
        setFavorites(data);
      } catch (error) {
        console.error("Failed to load favorites:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // --- Logic: フィルタリング用タブの生成 ---
  const corpusTabs = useMemo(() => {
    const map = new Map();
    favorites.forEach(f => {
      if (!map.has(f.corpus_id)) {
        map.set(f.corpus_id, f.corpus_name);
      }
    });
    return Array.from(map.entries());
  }, [favorites]);

  const filteredFavorites = useMemo(() => {
    if (selectedCorpusId === 'all') return favorites;
    return favorites.filter(f => f.corpus_id === selectedCorpusId);
  }, [favorites, selectedCorpusId]);

  // --- Handlers ---
  const handleConfirmRemove = async () => {
    if (!deletingId) return;
    
    const targetPhrase = favorites.find(f => f.phrase_id === deletingId);
    setFavorites(prev => prev.filter(f => f.phrase_id !== deletingId));
    setDeletingId(null);

    try {
      await toggleFavorite(deletingId, false);
      showToast('お気に入りから削除しました', 'success');
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      if (targetPhrase) setFavorites(prev => [...prev, targetPhrase]);
      showToast('削除に失敗しました', 'error');
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full space-y-4">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-400 font-bold animate-pulse">Loading Favorites...</p>
    </div>
  );

  return (
    /* 親のレイアウト内で高さを固定し、内部スクロールを有効にする */
    <div className="flex flex-col h-full bg-white rounded-[40px] shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden font-sans">
      
      {/* Header Area: 固定表示 */}
      <div className="shrink-0 bg-white border-b border-slate-50 px-6 pt-8 pb-6 z-30">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-slate-50 rounded-2xl transition-all active:scale-90 text-slate-400">
                <ChevronLeft size={28} />
              </button>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Favorites</h1>
            </div>
            {/* アイコン + 件数のチップ（アクセントカラーを使用） */}
            <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
              <Star size={14} className="text-amber-500" fill="currentColor" />
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider">
                {favorites.length} Items
              </span>
            </div>
          </div>

          {/* Corpus Filter Tabs */}
          {corpusTabs.length > 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
              <button
                onClick={() => setSelectedCorpusId('all')}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                  selectedCorpusId === 'all' 
                    ? 'bg-slate-900 text-white border-slate-900 shadow-lg' 
                    : 'bg-white text-slate-400 border-slate-100 hover:bg-slate-50 shadow-sm'
                }`}
              >
                All Sources
              </button>
              {corpusTabs.map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => setSelectedCorpusId(id)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                    selectedCorpusId === id 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' 
                      : 'bg-white text-slate-400 border-slate-100 hover:bg-indigo-50 hover:text-indigo-400 shadow-sm'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* List Content: スクロールエリア */}
      <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth bg-slate-50/20">
        <div className="px-6 pt-6 pb-24">
          {/* mode="popLayout" を指定することで、
            消えていく要素が「その場所」に縛られず、残る要素が即座に位置を詰められます。
          */}
          <AnimatePresence mode="popLayout" initial={false}>
            {filteredFavorites.length > 0 ? (
              <motion.div 
                key={selectedCorpusId} // タブ切り替えごとにコンテナごとフェードさせるならKeyを指定
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="grid gap-4"
              >
                {filteredFavorites.map((fav) => (
                  <motion.div 
                    layout="position" // 位置移動のアニメーションを安定させる
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 500, 
                      damping: 50, 
                      mass: 1 
                    }}
                    key={fav.phrase_id} // 安定した一意のIDを使用
                    className="bg-white p-6 rounded-4xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group"
                  >
                    {/* カードの中身はそのまま */}
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-black text-indigo-600 tracking-widest bg-indigo-50 px-2.5 py-1 rounded-lg uppercase">
                        {fav.word_en || 'PHRASE'}
                      </span>
                      <button 
                        onClick={() => setDeletingId(fav.phrase_id)} 
                        className="text-slate-200 hover:text-rose-500 transition-colors p-2 -mr-2 active:scale-75"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    
                    <div className="space-y-2 mb-6">
                      <p className="text-lg font-bold text-slate-800 leading-tight group-hover:text-indigo-900 transition-colors">
                        {fav.phrase_en}
                      </p>
                      <p className="text-sm text-slate-400 font-medium tracking-wide">
                        {fav.phrase_ja}
                      </p>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">
                        From: {fav.corpus_name}
                      </span>
                      <button 
                        onClick={() => speak(fav.phrase_en)}
                        className="flex items-center gap-2 text-[11px] font-black text-indigo-600 bg-indigo-50 px-5 py-2.5 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all active:scale-95 shadow-sm"
                      >
                        <Volume2 size={14} strokeWidth={3} />
                        LISTEN
                      </button>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center space-y-4"
              >
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-slate-200 shadow-inner">
                  <Star size={40} />
                </div>
                <p className="text-slate-500 font-bold">No phrases found</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[40px] p-8 w-full max-w-xs shadow-2xl space-y-6 text-center"
            >
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Trash2 size={28} />
              </div>

              <div className="space-y-2">
                <p className="font-black text-slate-800 text-lg tracking-tight">Remove phrase?</p>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  お気に入りから削除してもよろしいですか？
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 h-12 text-[11px] font-black text-slate-400 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all"
                >
                  CANCEL
                </button>
                <button 
                  onClick={handleConfirmRemove}
                  className="flex-1 h-12 text-[11px] font-black text-white bg-rose-500 rounded-2xl hover:bg-rose-600 shadow-lg shadow-rose-100 transition-all active:scale-95"
                >
                  REMOVE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}