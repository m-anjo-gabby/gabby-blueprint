'use client';

import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Search, ArrowRight, Star, Filter, Tag, ChevronUp, ChevronDown } from 'lucide-react';

// Actions & Utils
import { getAllCorpus, toggleCorpusFavorite } from '@/actions/corpusAction';
import { CorpusRecord } from '@/types/corpus';
import { useToast } from '@/hooks/useToast';
import { getTrainingPath } from '@/utils/navigation';

/**
 * 教材ライブラリ（一覧）ページ
 * 顧客に紐付く全ての教材を表示し、検索・フィルタリング・お気に入り登録・学習開始を提供します。
 */
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

  // テキストの溢れ判定用リファレンス
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

  // --- Logic: フィルタリング & チップ生成 ---
  
  // 全コーパスからタグを収集してユニークなリストを作成
  const categoryChips = useMemo(() => {
    const tagsSet = new Set<string>(['All']);
    corpusList.forEach(c => {
      c.metadata.tags?.forEach(t => {
        if (t.label) tagsSet.add(t.label);
      });
    });
    return Array.from(tagsSet).sort();
  }, [corpusList]);

  // 検索クエリとタグによる絞り込み
  const filteredList = useMemo(() => {
    return corpusList.filter(c => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        c.corpus_name.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query) ||
        c.corpus_label.toLowerCase().includes(query);
      
      const matchesTag = selectedTag === 'All' || 
        c.metadata.tags?.some(t => t.label === selectedTag);

      return matchesSearch && matchesTag;
    });
  }, [corpusList, searchQuery, selectedTag]);

  // --- Logic: 説明文の「もっと見る」判定 ---
  useLayoutEffect(() => {
    const observers: ResizeObserver[] = [];
    filteredList.forEach((corpus) => {
      const el = descriptionRefs.current[corpus.corpus_id];
      if (!el) return;

      const check = () => {
        // 2行(line-clamp-2)を超えているかどうかを判定
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

  /**
   * お気に入り状態の切り替え（楽観的UI更新）
   */
  const handleToggleFavorite = async (e: React.MouseEvent, corpusId: string, currentState: boolean) => {
    e.stopPropagation();
    const nextState = !currentState;
    
    // 状態を先行して更新
    setCorpusList(prev => prev.map(c => c.corpus_id === corpusId ? { ...c, is_favorite: nextState } : c));
    
    try {
      await toggleCorpusFavorite(corpusId, nextState);
      showToast(nextState ? 'お気に入りに追加しました' : 'お気に入りから削除しました', 'success');
    } catch (error) {
      console.error("Favorite toggle error:", error);
      // エラー時は元の状態に戻す
      setCorpusList(prev => prev.map(c => c.corpus_id === corpusId ? { ...c, is_favorite: currentState } : c));
      showToast('更新に失敗しました', 'error');
    }
  };

  // --- Render ---

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-white space-y-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
      </div>
      <p className="text-slate-400 font-bold animate-pulse">Loading Library...</p>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden">
      
      {/* Header Area: 検索とフィルタを固定表示 */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-6 pt-10 pb-6 z-30 shadow-sm">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => router.back()} 
                className="p-2 -ml-2 hover:bg-slate-50 rounded-2xl transition-all active:scale-90 text-slate-400"
              >
                <ChevronLeft size={28} />
              </button>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Library</h1>
            </div>
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300">
              <Tag size={20} />
            </div>
          </div>

          {/* Search Bar */}
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

          {/* Filter Chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-6 px-6">
            {categoryChips.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                  selectedTag === tag 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200 shadow-sm'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area: スクロール可能なカードリスト */}
      <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
        <div className="max-w-2xl mx-auto px-6 pt-6 pb-24">
          <div className="grid gap-4">
            {filteredList.length > 0 ? (
              filteredList.map((corpus) => {
                const isExpanded = !!expandedIds[corpus.corpus_id];
                const shouldShowMore = truncatedIds[corpus.corpus_id] || isExpanded;
                return (
                  <div 
                    key={corpus.corpus_id} 
                    className="relative bg-white border border-slate-100 rounded-4xl p-6 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all duration-300 group animate-in fade-in slide-in-from-bottom-2"
                  >
                    
                    {/* Card Header: Label & Difficulty & Favorite */}
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

                    {/* Card Content: Title & Description */}
                    <div className="mb-4">
                      <h3 
                        onClick={() => router.push(getTrainingPath(corpus))} 
                        className="font-black text-slate-800 text-[19px] leading-tight group-hover:text-indigo-600 transition-colors mb-2 cursor-pointer"
                      >
                        {corpus.corpus_name}
                      </h3>
                      <div className="relative">
                        <p 
                          ref={(el) => { descriptionRefs.current[corpus.corpus_id] = el; }}
                          className={`text-[14px] text-slate-500 font-medium leading-relaxed overflow-hidden ${
                            isExpanded ? 'line-clamp-none' : 'line-clamp-2'
                          }`}
                          style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical' }}
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

                    {/* Tags Section */}
                    <div className="flex flex-wrap gap-1.5 mb-6">
                      {corpus.metadata.tags?.map(t => (
                        <span key={t.id} className="px-2.5 py-1 rounded-full border border-slate-100 bg-slate-50/50 text-slate-400 text-[9px] font-extrabold uppercase tracking-tight">
                          {t.label}
                        </span>
                      ))}
                    </div>

                    {/* Action Button: 詳細ページへの遷移 */}
                    <button 
                      onClick={() => router.push(getTrainingPath(corpus))}
                      className="w-full h-14 min-h-14 bg-indigo-50 rounded-2xl flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all active:scale-[0.98] group/btn"
                    >
                      <span className="text-indigo-600 font-black text-[12px] tracking-widest group-hover/btn:text-white transition-colors uppercase">
                        Start Learning
                      </span>
                      <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-indigo-600 group-hover/btn:bg-indigo-500 group-hover/btn:text-white transition-all shadow-sm">
                        <ArrowRight size={12} strokeWidth={3} />
                      </div>
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="py-20 text-center space-y-4">
                <Filter className="text-slate-300 mx-auto" size={32} />
                <p className="text-slate-400 text-sm font-bold tracking-wide">No results found in library</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}