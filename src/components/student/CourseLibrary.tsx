'use client';

import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { ChevronLeft, Search, ArrowRight, Star, Filter, Tag, ChevronUp, ChevronDown } from 'lucide-react';
import { getAllCorpus, toggleCorpusFavorite } from '@/actions/corpusAction';
import { CorpusRecord } from '@/types/corpus';
import { useToast } from '@/hooks/useToast';

interface CourseLibraryProps {
  onSelect: (corpusId: string) => void;
  onBack: () => void;
}

export default function CourseLibrary({ onSelect, onBack }: CourseLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [corpusList, setCorpusList] = useState<CorpusRecord[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [truncatedIds, setTruncatedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const descriptionRefs = useRef<Record<string, HTMLParagraphElement | null>>({});
  const { showToast } = useToast();

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

  // 全コーパスからタグをフラットに収集してフィルタチップを生成
  const categoryChips = useMemo(() => {
    const tagsSet = new Set<string>(['All']);
    corpusList.forEach(c => {
      c.metadata.tags?.forEach(t => {
        if (t.label) tagsSet.add(t.label);
      });
    });
    return Array.from(tagsSet).sort(); // 名前順に並べると見やすい
  }, [corpusList]);

  // 検索 + フラットなタグ一致によるフィルタリング
  const filteredList = useMemo(() => {
    return corpusList.filter(c => {
      const matchesSearch = 
        c.corpus_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.corpus_label.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTag = selectedTag === 'All' || 
        c.metadata.tags?.some(t => t.label === selectedTag);

      return matchesSearch && matchesTag;
    });
  }, [corpusList, searchQuery, selectedTag]);

  // --- スマートな溢れ判定ロジック ---
  useLayoutEffect(() => {
    const observers: ResizeObserver[] = [];

    // 現在表示されている各コーパスに対して監視を設定
    corpusList.forEach((corpus) => {
      const el = descriptionRefs.current[corpus.corpus_id];
      if (!el) return;

      const check = () => {
        // line-clamp状態での clientHeight と scrollHeight を比較
        // 展開中は truncated を維持したいため、!expanded の時のみ更新する、
        // もしくは単純に「本来溢れるはずか」を判定
        const isOverflow = el.scrollHeight > el.clientHeight;
        setTruncatedIds(prev => ({ ...prev, [corpus.corpus_id]: isOverflow }));
      };

      // 初回チェック
      check();

      // リサイズ監視（画面回転やウィンドウサイズ変更対策）
      const ro = new ResizeObserver(check);
      ro.observe(el);
      observers.push(ro);
    });

    return () => observers.forEach(ro => ro.disconnect());
  }, [corpusList, filteredList]); // リストが更新されるたびに再設定

  const handleToggleFavorite = async (e: React.MouseEvent, corpusId: string, currentState: boolean) => {
    e.stopPropagation();
    const nextState = !currentState;
    setCorpusList(prev => prev.map(c => c.corpus_id === corpusId ? { ...c, is_favorite: nextState } : c));
    try {
      await toggleCorpusFavorite(corpusId, nextState);
      showToast(nextState ? 'お気に入りに追加しました' : 'お気に入りから削除しました', 'success');
    } catch (error) {
      console.error("Favorite toggle error:", error);
      setCorpusList(prev => prev.map(c => c.corpus_id === corpusId ? { ...c, is_favorite: currentState } : c));
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4 max-w-2xl mx-auto h-[80svh]">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-400 font-bold animate-pulse">Loading Library...</p>
    </div>
  );

  return (
    <div className="bg-white text-slate-900 rounded-[40px] p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300 max-w-2xl mx-auto h-[80svh] min-h-[80svh] max-h-[80svh] flex flex-col relative overflow-hidden">
      
      {/* Header & Controls */}
      <div className="shrink-0 z-20 space-y-6 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-50 rounded-2xl transition-all active:scale-90 text-slate-400">
              <ChevronLeft size={28} />
            </button>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Library</h1>
          </div>
          <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300">
            <Tag size={20} />
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input
            type="text"
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 bg-slate-50 border-none rounded-2xl pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500/10 transition-all placeholder:text-slate-300"
          />
        </div>

        {/* Flat Tag Filter Chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-2 px-2">
          {categoryChips.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                selectedTag === tag 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* List Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-8">
        <div className="grid gap-3 pt-1">
          {filteredList.length > 0 ? (
            filteredList.map((corpus) => {
              const isExpanded = !!expandedIds[corpus.corpus_id];
              const shouldShowMore = truncatedIds[corpus.corpus_id] || isExpanded;
              return (
                <div key={corpus.corpus_id} className="relative bg-white border border-slate-100 rounded-4xl p-6 hover:border-indigo-100 hover:shadow-xl hover:shadow-indigo-100/10 transition-all duration-300 group">
                  
                  {/* Top: Label & Favorite */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2.5 py-1 rounded-lg leading-none">
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

                  {/* Body: Title & Description */}
                  <div className="mb-4">
                    <h3 onClick={() => onSelect(corpus.corpus_id)} className="font-black text-slate-800 text-[19px] leading-tight group-hover:text-indigo-600 transition-colors mb-2 cursor-pointer">
                      {corpus.corpus_name}
                    </h3>
                    {/* シンプルな開閉ロジック */}
                    <div className="relative">
                      <p 
                        ref={(el) => { 
                          descriptionRefs.current[corpus.corpus_id] = el; 
                        }} // 波括弧で囲み、値を return しないようにする
                        className={`text-[14px] text-slate-500 font-medium leading-relaxed overflow-hidden ${
                          isExpanded ? 'line-clamp-none' : 'line-clamp-2'
                        }`}
                        style={{
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {corpus.description}
                      </p>
                      
                      {shouldShowMore && (
                        <button 
                          onClick={() => setExpandedIds(prev => ({ ...prev, [corpus.corpus_id]: !isExpanded }))}
                          className="mt-1 flex items-center gap-1 text-indigo-400 text-[11px] font-extrabold py-1 active:opacity-50"
                        >
                          {isExpanded ? (
                            <><ChevronUp size={14} /> SHOW LESS</>
                          ) : (
                            <><ChevronDown size={14} /> MORE DETAILS</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tags: Flat pill style */}
                  <div className="flex flex-wrap gap-1.5 mb-6">
                    {corpus.metadata.tags?.map(t => (
                      <span key={t.id} className="px-2.5 py-1 rounded-full border border-slate-100 bg-slate-50/50 text-slate-400 text-[9px] font-extrabold uppercase tracking-tight">
                        {t.label}
                      </span>
                    ))}
                  </div>

                  {/* 学習開始ボタン：ホバー時の文字色修正 ＆ z-index確保 */}
                    <button 
                      onClick={() => onSelect(corpus.corpus_id)}
                      className="w-full h-14 min-h-14 bg-indigo-50 rounded-2xl flex items-center justify-center gap-3 shrink-0 flex-none hover:bg-indigo-600 transition-all active:scale-[0.98] group/btn relative z-10"
                      style={{ WebkitFlexShrink: 0 }}
                    >
                      <span className="text-indigo-600 font-black text-[12px] tracking-widest shrink-0 group-hover/btn:text-white transition-colors uppercase">
                        Start Learning
                      </span>
                      <div className="w-6 h-6 rounded-full bg-white shrink-0 flex items-center justify-center text-indigo-600 group-hover/btn:bg-indigo-500 group-hover/btn:text-white transition-all shadow-sm">
                        <ArrowRight size={12} strokeWidth={3} />
                      </div>
                    </button>
                </div>
              );
            })
          ) : (
            <div className="py-20 text-center space-y-2">
              <Filter className="mx-auto text-slate-100" size={48} />
              <p className="text-slate-400 text-sm font-medium">No results found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}