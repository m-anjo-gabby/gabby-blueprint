'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Star } from 'lucide-react';
import { getFavoritePhrases, getFavoriteCorpuses } from '@/actions/corpusAction';
import { FavoritePhraseRecord } from '@/types/training';
import { FavoriteCorpusRecord } from '@/types/corpus';
import { useToast } from '@/hooks/useToast';
import PhraseFavorites from './_components/PhraseFavorites';
import CorpusFavorites from './_components/CorpusFavorites';

export interface FavoritePageState {
  corpuses: FavoriteCorpusRecord[] | null;
  phrases: FavoritePhraseRecord[] | null;
}

export default function FavoritePage() {
  const router = useRouter();
  const { showToast } = useToast();

  // --- States ---
  const [activeTab, setActiveTab] = useState<'corpuses' | 'phrases'>('corpuses');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FavoritePageState>({
      corpuses: null,
      phrases: null,
  });

  // --- Logic: データ取得関数 ---
  const fetchData = useCallback(async (tab: 'corpuses' | 'phrases') => {
    // キャッシュがあればスキップ
    if (data[tab]) return;

    setLoading(true);
    try {
      if (tab === 'phrases') {
        const res = await getFavoritePhrases();
        setData(prev => ({ ...prev, phrases: res }));
      } else {
        const res = await getFavoriteCorpuses();
        setData(prev => ({ ...prev, corpuses: res }));
      }
    } catch (error) {
      console.error(error);
      showToast('データの取得に失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  }, [data, showToast]);

  // --- Effects ---
  useEffect(() => {
    fetchData(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="flex flex-col h-full bg-white rounded-[40px] shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden font-sans">
      
      {/* Header Area */}
      <div className="shrink-0 bg-white border-b border-slate-50 px-6 pt-8 pb-6 z-30 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-slate-50 rounded-2xl transition-all active:scale-90 text-slate-400">
              <ChevronLeft size={28} />
            </button>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Favorites</h1>
          </div>
          
          <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
            <Star size={14} className="text-amber-500" fill="currentColor" />
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider">
              {data[activeTab]?.length || 0} Items
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1.5 bg-slate-100 rounded-[22px]">
          {(['corpuses', 'phrases'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-[10px] md:text-xs font-black uppercase tracking-[0.2em] rounded-[18px] transition-all ${
                activeTab === tab 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab === 'corpuses' ? 'コーパス' : 'フレーズ'}
            </button>
          ))}
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth bg-slate-50/20">
        {loading && !data[activeTab] ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-6 pt-6 pb-24">
            {activeTab === 'phrases' && data.phrases && (
              <PhraseFavorites 
                phrases={data.phrases} 
                setPhrases={setData} 
              />
            )}
            
            {activeTab === 'corpuses' && data.corpuses && (
              <CorpusFavorites 
                  corpuses={data.corpuses}
                  setCorpuses={setData} 
                />
            )}
          </div>
        )}
      </div>
    </div>
  );
}