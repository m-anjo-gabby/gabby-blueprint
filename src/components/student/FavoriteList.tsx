'use client';

import { useState, useEffect } from 'react';
import { toggleFavorite, getFavoritePhrases } from '@/actions/corpusAction';
import { ChevronLeft, Star, Volume2, Trash2 } from 'lucide-react';
import { FavoritePhraseRecord } from '@/types/training';

export default function FavoriteList({ onBack }: { onBack: () => void }) {
  const [favorites, setFavorites] = useState<FavoritePhraseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getFavoritePhrases();
      setFavorites(data);
      setLoading(false);
    }
    load();
  }, []);

  const handleRemove = async (phraseId: string) => {
    if (!confirm("お気に入りから削除しますか？")) return;
    await toggleFavorite(phraseId, false);
    setFavorites(prev => prev.filter(f => f.phrase_id !== phraseId));
  };

  if (loading) return <div className="p-10 text-center text-slate-400">Loading Favorites...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <h1 className="text-xl font-bold text-slate-800">My Favorites</h1>
      </div>

      {favorites.length > 0 ? (
        <div className="grid gap-3">
          {favorites.map((fav) => (
            <div key={fav.favorite_id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3 group">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-full">
                  Keyword: {fav.word_en}
                </span>
                <button 
                  onClick={() => handleRemove(fav.phrase_id)}
                  className="text-slate-300 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              
              <div className="space-y-1">
                <p className="text-lg font-bold text-slate-800 leading-tight">{fav.phrase_en}</p>
                <p className="text-sm text-slate-500 font-medium">{fav.phrase_ja}</p>
              </div>

              <div className="flex justify-end">
                <button className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-600 hover:text-white transition-all">
                  <Volume2 size={14} />
                  PRONOUNCE
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200">
          <Star size={40} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-400 font-medium">お気に入りのフレーズはまだありません</p>
        </div>
      )}
    </div>
  );
}