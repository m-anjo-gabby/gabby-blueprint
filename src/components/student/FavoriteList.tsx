'use client';

import { useState, useEffect, useMemo } from 'react';
import { toggleFavorite, getFavoritePhrases } from '@/actions/corpusAction';
import { ChevronLeft, Star, Volume2, Trash2 } from 'lucide-react';
import { FavoritePhraseRecord } from '@/types/training';
import { useVoice } from '@/hooks/useVoice';

export default function FavoriteList({ onBack }: { onBack: () => void }) {
  const [favorites, setFavorites] = useState<FavoritePhraseRecord[]>([]);
  const [selectedCorpusId, setSelectedCorpusId] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // speak関数を取得
  const { speak } = useVoice();

  // 初期データフェッチ
  useEffect(() => {
    async function load() {
      const data = await getFavoritePhrases();
      setFavorites(data);
      setLoading(false);
    }
    load();
  }, []);

  // 存在するコーパスのリストを動的に抽出
  const corpusTabs = useMemo(() => {
    const map = new Map();
    favorites.forEach(f => {
      if (!map.has(f.corpus_id)) {
        map.set(f.corpus_id, f.corpus_name);
      }
    });
    return Array.from(map.entries());
  }, [favorites]);

  // 表示するリストをフィルタリング
  const filteredFavorites = useMemo(() => {
    if (selectedCorpusId === 'all') return favorites;
    return favorites.filter(f => f.corpus_id === selectedCorpusId);
  }, [favorites, selectedCorpusId]);

  // お気に入り削除確認処理
    const handleConfirmRemove = async () => {
      if (!deletingId) return;
      await toggleFavorite(deletingId, false);
      setFavorites(prev => prev.filter(f => f.phrase_id !== deletingId));
      setDeletingId(null); // モーダルを閉じる
    };

  if (loading) return (
    <div className="flex justify-center items-center h-[75svh]">
      <div className="animate-spin h-8 w-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
    </div>
  );

  return (
    <div className="bg-white text-slate-900 rounded-[40px] p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300 max-w-2xl mx-auto h-[80svh] min-h-[80svh] max-h-[80svh] flex flex-col relative overflow-hidden">
      
      {/* ヘッダーエリア */}
      <div className="shrink-0 z-20 bg-white pb-4 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="p-2 hover:bg-slate-50 rounded-full transition-all active:scale-90 border border-transparent hover:border-slate-100">
              <ChevronLeft size={24} className="text-slate-600" />
            </button>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">My Favorites</h1>
          </div>
          <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-tighter">
            {favorites.length} items
          </span>
        </div>

        {/* コーパス切替タブ */}
        {corpusTabs.length > 1 && (
          <div className="shrink-0 flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-2 px-2">
            <button
              onClick={() => setSelectedCorpusId('all')}
              className={`px-5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCorpusId === 'all' 
                  ? 'bg-slate-900 text-white shadow-lg' 
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
              }`}
            >
              All
            </button>
            {corpusTabs.map(([id, name]) => (
              <button
                key={id}
                onClick={() => setSelectedCorpusId(id)}
                className={`px-5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCorpusId === id 
                    ? 'bg-indigo-600 text-white shadow-lg' 
                    : 'bg-white text-slate-400 border border-slate-200 hover:border-indigo-200'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 一覧エリア */}
      <div 
        className="flex-1 overflow-y-auto no-scrollbar pb-6"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {filteredFavorites.length > 0 ? (
          <div className="grid gap-4 pt-2">
            {filteredFavorites.map((fav) => (
              <div key={fav.favorite_id} className="bg-white p-5 rounded-4xl border border-slate-100 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2.5 py-1 rounded-lg">
                    Keyword: {fav.word_en}
                  </span>
                  {/* ゴミ箱クリックでモーダルを開く */}
                  <button 
                    onClick={() => setDeletingId(fav.phrase_id)} 
                    className="text-slate-300 hover:text-rose-500 transition-colors p-1"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                
                <div className="space-y-1.5">
                  <p className="text-lg font-bold text-slate-800 leading-tight">{fav.phrase_en}</p>
                  <p className="text-sm text-slate-500 font-medium">{fav.phrase_ja}</p>
                </div>

                <div className="flex justify-end pt-1">
                  {/* ボタンの名称を LISTEN に統一し、speakをバインド */}
                  <button 
                    onClick={() => speak(fav.phrase_en)}
                    className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all active:scale-95 shadow-sm"
                  >
                    <Volume2 size={15} />
                    LISTEN
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-100">
            <Star size={40} className="mx-auto text-slate-200 mb-4" />
            <p className="text-slate-400 font-medium">お気に入りフレーズはまだありません</p>
          </div>
        )}
      </div>

      {/* お気に入り削除確認モーダル */}
      {deletingId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="bg-white rounded-4xl p-8 w-full max-w-xs shadow-2xl space-y-6 text-center animate-in zoom-in-95 duration-300">
            {/* アイコン装飾 */}
            <div className="relative w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto shadow-inner shadow-rose-100/50">
              <Trash2 size={28} />
              <div className="absolute inset-0 rounded-full animate-ping bg-rose-400 opacity-10"></div>
            </div>

            <div className="space-y-2">
              <p className="font-bold text-slate-800 text-lg tracking-tight">Remove Favorite?</p>
              <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                このフレーズをお気に入りから削除しますか？<br />
                この操作は取り消せません。
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setDeletingId(null)}
                className="flex-1 h-12 flex items-center justify-center text-[11px] font-black text-slate-400 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all active:scale-95"
              >
                CANCEL
              </button>
              <button 
                onClick={handleConfirmRemove}
                className="flex-1 h-12 flex items-center justify-center text-[11px] font-black text-white bg-rose-500 rounded-2xl hover:bg-rose-600 shadow-lg shadow-rose-100 transition-all active:scale-95"
              >
                REMOVE
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}