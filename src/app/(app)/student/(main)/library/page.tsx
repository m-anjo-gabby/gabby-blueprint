'use client';

import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Search, ArrowRight, Star, Filter, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Actions & Utils
import { getAllCorpus, toggleCorpusFavorite } from '@/actions/corpusAction';
import { CorpusRecord } from '@/types/corpus';
import { useToast } from '@/hooks/useToast';
import { getTrainingPath } from '@/utils/navigation';

export default function LibraryPage() {
  const router = useRouter();
  const { showToast } = useToast();
  
  // --- States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [corpusList, setCorpusList] = useState<CorpusRecord[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [truncatedIds, setTruncatedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const descriptionRefs = useRef<Record<string, HTMLParagraphElement | null>>({});

  // --- Data Fetching ---
  useEffect(() => {
    async function fetchList() {
      try {
        const data = await getAllCorpus();
        setCorpusList(data);
      } catch (error) {
        console.error("Failed to fetch library:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchList();
  }, []);

  // --- Logic: フィルタリング ---
  const categoryChips = useMemo(() => {
    const tagsSet = new Set<string>(['All']);
    corpusList.forEach(c => {
      c.metadata.tags?.forEach(t => {
        if (t.label) tagsSet.add(t.label);
      });
    });
    return Array.from(tagsSet).sort();
  }, [corpusList]);

  const filteredList = useMemo(() => {
    return corpusList.filter(c => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        c.corpus_name.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.corpus_label.toLowerCase().includes(q);
      const matchesTag = selectedTag === 'All' || 
        c.metadata.tags?.some(t => t.label === selectedTag);
      return matchesSearch && matchesTag;
    });
  }, [corpusList, searchQuery, selectedTag]);

  // --- Logic: 行数溢れ判定 ---
  useLayoutEffect(() => {
    const observers: ResizeObserver[] = [];
    filteredList.forEach((corpus) => {
      const el = descriptionRefs.current[corpus.corpus_id];
      if (!el) return;
      const check = () => {
        const isOverflow = el.scrollHeight > el.clientHeight;
        setTruncatedIds(prev => ({ ...prev, [corpus.corpus_id]: isOverflow }));
      };
      check();
      const ro = new ResizeObserver(check);
      ro.observe(el);
      observers.push(ro);
    });
    return () => observers.forEach(ro => ro.disconnect());
  }, [filteredList]);

  // --- Handlers ---
  const handleToggleFavorite = async (e: React.MouseEvent, corpusId: string, currentState: boolean) => {
    e.stopPropagation();
    const nextState = !currentState;
    setCorpusList(prev => prev.map(c => c.corpus_id === corpusId ? { ...c, is_favorite: nextState } : c));
    try {
      await toggleCorpusFavorite(corpusId, nextState);
      showToast(nextState ? 'お気に入りに追加しました' : 'お気に入りから削除しました', 'success');
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      setCorpusList(prev => prev.map(c => c.corpus_id === corpusId ? { ...c, is_favorite: currentState } : c));
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full space-y-4">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-400 font-bold animate-pulse">Loading Library...</p>
    </div>
  );

  return (
    /* h-full で親の main コンテナいっぱいに広げる */
    <div className="flex flex-col h-full bg-white rounded-[40px] shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
      
      {/* 1. 固定ヘッダー（検索・タグ） */}
      <div className="shrink-0 bg-white border-b border-slate-50 px-6 pt-8 pb-6 z-10">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-slate-50 rounded-2xl transition-all active:scale-90 text-slate-400">
                <ChevronLeft size={28} />
              </button>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Library</h1>
            </div>
            {/* アイコン + 件数のチップ */}
            <div className="flex items-center gap-2 bg-slate-100/50 px-3 py-1.5 rounded-xl border border-slate-100">
              <Tag size={14} className="text-slate-400" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                {corpusList.length} Books
              </span>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              type="text"
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 bg-slate-50 border-none rounded-2xl pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {categoryChips.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                  selectedTag === tag 
                  ? 'bg-indigo-600 text-white border-indigo-600' 
                  : 'bg-white text-slate-400 border-slate-100 hover:bg-slate-50'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. スクロール可能なカードリスト */}
      <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth bg-slate-50/20">
        <div className="px-6 pt-6 pb-24">
          <div className="grid gap-4">
            <AnimatePresence mode="popLayout">
              {filteredList.length > 0 ? (
                filteredList.map((corpus) => {
                  const isExpanded = !!expandedIds[corpus.corpus_id];
                  const shouldShowMore = truncatedIds[corpus.corpus_id] || isExpanded;
                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={corpus.corpus_id} 
                      className="bg-white border border-slate-100 rounded-4xl p-6 shadow-sm group"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-2.5 py-1 rounded-lg">
                            {corpus.corpus_label}
                          </span>
                          <span className="text-[10px] font-bold text-slate-300">Lv.{corpus.difficulty_level}</span>
                        </div>
                        <button
                          onClick={(e) => handleToggleFavorite(e, corpus.corpus_id, corpus.is_favorite)}
                          className={`p-2 -mr-2 transition-all active:scale-75 ${corpus.is_favorite ? 'text-amber-400' : 'text-slate-200'}`}
                        >
                          <Star size={24} fill={corpus.is_favorite ? "currentColor" : "none"} strokeWidth={2.5} />
                        </button>
                      </div>

                      <div className="mb-4">
                        <h3 onClick={() => router.push(getTrainingPath(corpus))} className="font-black text-slate-800 text-[19px] leading-tight group-hover:text-indigo-600 transition-colors mb-2 cursor-pointer">
                          {corpus.corpus_name}
                        </h3>
                        <div className="relative">
                          <p ref={(el) => { descriptionRefs.current[corpus.corpus_id] = el; }}
                            className={`text-[14px] text-slate-500 font-medium leading-relaxed overflow-hidden ${isExpanded ? 'line-clamp-none' : 'line-clamp-2'}`}
                            style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical' }}
                          >
                            {corpus.description}
                          </p>
                          {shouldShowMore && (
                            <button onClick={() => setExpandedIds(prev => ({ ...prev, [corpus.corpus_id]: !isExpanded }))}
                              className="mt-1 flex items-center gap-1 text-indigo-400 text-[11px] font-extrabold py-1 active:opacity-50 uppercase">
                              {isExpanded ? 'Show Less' : 'More Details'}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-6">
                        {corpus.metadata.tags?.map(t => (
                          <span key={t.id} className="px-2.5 py-1 rounded-full border border-slate-100 bg-slate-50/50 text-slate-400 text-[9px] font-extrabold uppercase">
                            {t.label}
                          </span>
                        ))}
                      </div>

                      <button onClick={() => router.push(getTrainingPath(corpus))}
                        className="w-full h-14 bg-indigo-50 rounded-2xl flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all active:scale-[0.98] group/btn">
                        <span className="text-indigo-600 font-black text-[12px] tracking-widest group-hover/btn:text-white transition-colors uppercase">
                          Start Learning
                        </span>
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-indigo-600 group-hover/btn:bg-indigo-500 group-hover/btn:text-white transition-all shadow-sm">
                          <ArrowRight size={12} strokeWidth={3} />
                        </div>
                      </button>
                    </motion.div>
                  );
                })
              ) : (
                <div className="py-20 text-center space-y-4">
                  <Filter className="text-slate-300 mx-auto" size={32} />
                  <p className="text-slate-400 text-sm font-bold tracking-wide">No results found</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}