'use client';

import { useState, useMemo } from 'react';
import { toggleFavorite } from '@/actions/corpusAction';
import { Star, Volume2, Trash2 } from 'lucide-react';
import { FavoritePhraseRecord } from '@/types/training';
import { useVoice } from '@/hooks/useVoice';
import { useToast } from '@/hooks/useToast';
import { AnimatePresence, motion } from 'framer-motion';
import { FavoritePageState } from '../page';

interface PhraseFavoritesProps {
  phrases: FavoritePhraseRecord[];
  // 親の FavoritePageState 型を使用
  setPhrases: React.Dispatch<React.SetStateAction<FavoritePageState>>;
}

export default function PhraseFavorites({ phrases, setPhrases }: PhraseFavoritesProps) {
  const { speak } = useVoice();
  const { showToast } = useToast();

  // --- States ---
  const [selectedCorpusId, setSelectedCorpusId] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // --- Logic: フィルタリング用タブの生成 ---
  const corpusTabs = useMemo(() => {
    const map = new Map();
    phrases.forEach(f => {
      if (!map.has(f.corpus_id)) {
        map.set(f.corpus_id, f.corpus_name);
      }
    });
    return Array.from(map.entries());
  }, [phrases]);

  const filteredFavorites = useMemo(() => {
    if (selectedCorpusId === 'all') return phrases;
    return phrases.filter(f => f.corpus_id === selectedCorpusId);
  }, [phrases, selectedCorpusId]);

  // --- Handlers ---
  const handleConfirmRemove = async () => {
    if (!deletingId) return;
    
    const targetPhrase = phrases.find(f => f.phrase_id === deletingId);
    // 楽観的UI更新: 先にリストから消す
    setPhrases(prev => ({
      ...prev,
      phrases: prev.phrases ? prev.phrases.filter(f => f.phrase_id !== deletingId) : null
    }));
    setDeletingId(null);

    try {
      await toggleFavorite(deletingId, false);
      showToast('お気に入りから削除しました', 'success');
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      // 失敗した場合は元に戻す
      if (targetPhrase) {
        setPhrases(prev => ({
          ...prev,
          phrases: prev.phrases ? [...prev.phrases, targetPhrase] : [targetPhrase]
        }));
      }
      showToast('削除に失敗しました', 'error');
    }
  };

  return (
    <>
      {/* Corpus Filter Tabs: 内包されたフィルタリング */}
      {corpusTabs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6 pb-2">
          <button
            onClick={() => setSelectedCorpusId('all')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
              selectedCorpusId === 'all' 
                ? 'bg-slate-900 text-white border-slate-900 shadow-lg' 
                : 'bg-white text-slate-400 border-slate-100 hover:bg-slate-50 shadow-sm'
            }`}
          >
            All
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

      {/* List Content: Framer Motionによるアニメーションリスト */}
      <AnimatePresence mode="popLayout" initial={false}>
        {filteredFavorites.length > 0 ? (
          <motion.div 
            key={selectedCorpusId} 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="grid gap-4"
          >
            {filteredFavorites.map((fav) => (
              <motion.div 
                layout="position" 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ 
                  type: "spring", 
                  stiffness: 500, 
                  damping: 50, 
                  mass: 1 
                }}
                key={fav.favorite_id}
                className="bg-white p-6 rounded-4xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group"
              >
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
    </>
  );
}