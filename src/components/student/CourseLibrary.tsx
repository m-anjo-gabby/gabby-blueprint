'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, Search, BookOpen, ArrowRight } from 'lucide-react';
import { CorpusRecord } from '@/actions/dashboardAction';

interface CourseLibraryProps {
  corpusList: CorpusRecord[];
  onSelect: (corpusId: string) => void;
  onBack: () => void;
}

export default function CourseLibrary({ corpusList, onSelect, onBack }: CourseLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // 検索フィルタリング
  const filteredList = useMemo(() => {
    return corpusList.filter(c => 
      c.corpus_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.corpus_label?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [corpusList, searchQuery]);

  return (
    <div className="bg-white text-slate-900 rounded-[40px] p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300 max-w-2xl mx-auto h-[80svh] min-h-[80svh] max-h-[80svh] flex flex-col relative overflow-hidden">
      
      {/* Header Area */}
      <div className="shrink-0 z-20 bg-white pb-4 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="p-2 hover:bg-slate-50 rounded-full transition-all active:scale-90">
              <ChevronLeft size={24} className="text-slate-600" />
            </button>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Course Library</h1>
          </div>
          <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
            <BookOpen size={20} />
          </div>
        </div>

        {/* 検索バー */}
        <div className="relative shrink-0">
          <Search 
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" 
            size={18} 
          />
          <input
            type="text"
            placeholder="教材名、キーワードで検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 bg-slate-50 border-none rounded-2xl pr-4 text-[16px] md:text-sm focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400 font-medium appearance-none"
            style={{ 
              paddingLeft: '3rem', // 48px相当。Tailwindのpl-12をインラインで強制
              WebkitAppearance: 'none', // Safari用リセット
              display: 'block' // inline-blockだとパディングが効かない場合があるため
            }}
          />
        </div>
      </div>

      {/* List Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-6" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="grid gap-3 pt-2">
          {filteredList.length > 0 ? (
            filteredList.map((corpus) => (
              <button
                key={corpus.corpus_id}
                onClick={() => onSelect(corpus.corpus_id)}
                className="group flex items-center gap-4 p-4 bg-white rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all text-left active:scale-[0.98]"
              >
                {/* 簡易アイコン（または画像） */}
                <div className="w-14 h-14 bg-slate-50 rounded-2xl shrink-0 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                  <BookOpen size={24} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{corpus.corpus_label}</span>
                  </div>
                  <h3 className="font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                    {corpus.corpus_name}
                  </h3>
                  <p className="text-[11px] text-slate-400 line-clamp-1 font-medium">
                    {corpus.description}
                  </p>
                </div>

                <div className="text-slate-200 group-hover:text-indigo-300 transition-colors pr-2">
                  <ArrowRight size={18} />
                </div>
              </button>
            ))
          ) : (
            <div className="text-center py-20">
              <p className="text-slate-400 font-medium text-sm">該当する教材が見つかりません</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}