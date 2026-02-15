'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toggleFavorite, getFavoritePhrases } from '@/actions/corpusAction';
import { ChevronLeft, Star, Volume2, Trash2 } from 'lucide-react';
import { FavoritePhraseRecord } from '@/types/training';
import { useVoice } from '@/hooks/useVoice';
import { useToast } from '@/hooks/useToast';

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
    
    // 楽観的更新
    const targetPhrase = favorites.find(f => f.phrase_id === deletingId);
    setFavorites(prev => prev.filter(f => f.phrase_id !== deletingId));
    setDeletingId(null);

    try {
      await toggleFavorite(deletingId, false);
      showToast('お気に入りから削除しました', 'success');
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      // 失敗時はリストを戻す
      if (targetPhrase) setFavorites(prev => [...prev, targetPhrase]);
      showToast('削除に失敗しました', 'error');
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center h-screen bg-white">
      <div className="animate-spin h-8 w-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      <div className="w-full max-w-2xl bg-white min-h-screen flex flex-col relative shadow-xl shadow-slate-200/50">
        
        {/* Header Area: 固定表示 */}
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md px-6 pt-10 pb-4 border-b border-slate-50">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => router.back()} 
                  className="p-2 -ml-2 hover:bg-slate-50 rounded-2xl transition-all active:scale-90 text-slate-400"
                >
                  <ChevronLeft size={28} />
                </button>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Favorites</h1>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg uppercase tracking-wider">
                  {favorites.length} PHRASES
                </span>
              </div>
            </div>

            {/* Corpus Filter Tabs */}
            {corpusTabs.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-6 px-6 pb-2">
                <button
                  onClick={() => setSelectedCorpusId('all')}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                    selectedCorpusId === 'all' 
                      ? 'bg-slate-900 text-white shadow-lg' 
                      : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  All Sources
                </button>
                {corpusTabs.map(([id, name]) => (
                  <button
                    key={id}
                    onClick={() => setSelectedCorpusId(id)}
                    className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                      selectedCorpusId === id 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                        : 'bg-slate-100 text-slate-400 hover:bg-indigo-50 hover:text-indigo-400'
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
        <div className="flex-1 px-6 py-6 pb-24">
          {filteredFavorites.length > 0 ? (
            <div className="grid gap-4">
              {filteredFavorites.map((fav) => (
                <div 
                  key={fav.favorite_id} 
                  className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:border-indigo-100 transition-all group animate-in fade-in slide-in-from-bottom-2"
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
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                <Star size={40} />
              </div>
              <div className="space-y-1">
                <p className="text-slate-500 font-bold">No favorite phrases yet</p>
                <p className="text-slate-300 text-xs">気になるフレーズを保存して、自分だけの<br/>フレーズ集を作りましょう。</p>
              </div>
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {deletingId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[40px] p-8 w-full max-w-xs shadow-2xl space-y-6 text-center animate-in zoom-in-95 duration-300">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}