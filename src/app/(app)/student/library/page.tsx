'use client';

import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Search, ArrowRight, Star, Filter, BookOpen, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Actions & Utils
import { getAllContent, toggleContentFavorite } from '@/actions/contentAction';
import { ContentItem } from '@/types/content';
import { useToast } from '@/hooks/useToast';
import { getTrainingPath } from '@/utils/navigation';

// タブの定義
const TABS = [
  { id: 'All' as const, label: 'All' },
  { id: 0 as const, label: '単語帳' },
  { id: 1 as const, label: 'ビデオ' },
  { id: 2 as const, label: 'Gabby' }
];

export default function LibraryPage() {
  const router = useRouter();
  const { showToast } = useToast();
  
  // --- States ---
  const [selectedType, setSelectedType] = useState<number | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [truncatedIds, setTruncatedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const descriptionRefs = useRef<Record<string, HTMLParagraphElement | null>>({});

  // --- Data Fetching ---
  useEffect(() => {
    async function fetchList() {
      try {
        const data = await getAllContent();
        setContentList(data);
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
    contentList.forEach(c => {
      c.metadata.tags?.forEach(t => {
        if (t.label) tagsSet.add(t.label);
      });
    });
    return Array.from(tagsSet).sort();
  }, [contentList]);

  const filteredList = useMemo(() => {
    return contentList.filter(c => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        c.content_name.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.content_label.toLowerCase().includes(q);
      
      // 種別フィルタ（0:単語, 1:ビデオ, 2:Gabby...）
      const matchesType = selectedType === 'All' || c.content_type === selectedType;
      
      // タグフィルタ（selectedTagが'All'でない場合のみ）
      const matchesTag = selectedTag === 'All' || 
        c.metadata.tags?.some(t => t.label === selectedTag);
        
      return matchesSearch && matchesType && matchesTag;
    });
  }, [contentList, searchQuery, selectedType, selectedTag]);

  // --- Logic: 行数溢れ判定 ---
  useLayoutEffect(() => {
    const observers: ResizeObserver[] = [];
    filteredList.forEach((content) => {
      const el = descriptionRefs.current[content.content_id];
      if (!el) return;
      const check = () => {
        const isOverflow = el.scrollHeight > el.clientHeight;
        setTruncatedIds(prev => ({ ...prev, [content.content_id]: isOverflow }));
      };
      check();
      const ro = new ResizeObserver(check);
      ro.observe(el);
      observers.push(ro);
    });
    return () => observers.forEach(ro => ro.disconnect());
  }, [filteredList]);

  // --- Handlers ---
  const handleToggleFavorite = async (e: React.MouseEvent, contentId: string, currentState: boolean) => {
    e.stopPropagation();
    const nextState = !currentState;
    setContentList(prev => prev.map(c => c.content_id === contentId ? { ...c, is_favorite: nextState } : c));
    try {
      await toggleContentFavorite(contentId, nextState);
      showToast(nextState ? 'お気に入りに追加しました' : 'お気に入りから削除しました', 'success');
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      setContentList(prev => prev.map(c => c.content_id === contentId ? { ...c, is_favorite: currentState } : c));
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
    <div className="flex flex-col max-w-2xl min-w-2xl h-full bg-white rounded-[40px] shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
      
    {/* 1. 固定ヘッダー（検索・種別タブ） */}
    <div className="shrink-0 bg-white border-b border-slate-50 px-6 pt-8 pb-4 z-10">
      <div className="space-y-6">
        {/* タイトル & 件数 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-slate-50 rounded-2xl transition-all active:scale-90 text-slate-400">
              <ChevronLeft size={28} />
            </button>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Library</h1>
          </div>

          {/* 件数表示、またはリセットボタン（フィルタ時） */}
          {(searchQuery || selectedType !== 'All' || selectedTag !== 'All') ? (
            <button 
              onClick={() => {
                setSearchQuery('');
                setSelectedType('All');
                setSelectedTag('All');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-all group active:scale-95"
            >
              <span className="text-[10px] font-black uppercase tracking-widest">Reset Filters</span>
              <X size={12} strokeWidth={3} className="text-indigo-400 group-hover:text-indigo-600" />
            </button>
          ) : (
            /* 条件がない時は通常の件数表示 */
            <div className="flex items-center gap-2 bg-slate-100/50 px-3 py-1.5 rounded-xl border border-slate-100">
              <BookOpen size={12} className="text-slate-400" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider tabular-nums">
                {filteredList.length} Items
              </span>
            </div>
          )}

        </div>

        {/* 検索バー + オプションフィルタ */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              type="text"
              placeholder="キーワードを入力..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 bg-slate-50 border-none rounded-xl pl-11 pr-4 text-base font-medium focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none"
            />
          </div>
          {/* タグ選択ボタン：タグが多い場合はここからドロップダウン等を開く想定 */}
          <div className="relative">
            <select 
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="appearance-none h-11 px-4 bg-slate-50 border-none rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 focus:ring-2 focus:ring-indigo-500/10 outline-none pr-8 cursor-pointer"
            >
              {/* 'All' の時だけ色を少し薄く見せる、といった制御も検討の余地あり */}
              {categoryChips.map(tag => (
                <option key={tag} value={tag}>
                  {tag === 'All' ? 'All Tags' : `# ${tag}`} 
                </option>
              ))}
            </select>
            <Filter size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
          </div>
        </div>

        {/* コーパス種別（Type）タブ：モバイルでも1行に収まる固定幅 */}
        <div className="flex p-1 bg-slate-100/80 rounded-2xl">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setSelectedType(tab.id)}
              className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                selectedType === tab.id
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}
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
                filteredList.map((content) => {
                  const isExpanded = !!expandedIds[content.content_id];
                  const shouldShowMore = truncatedIds[content.content_id] || isExpanded;
                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={content.content_id} 
                      className="group relative w-full p-px rounded-4xl bg-slate-100 hover:bg-indigo-300 shadow-sm hover:shadow-md"
                    >
                      <div className="relative bg-white rounded-[31px] p-6 overflow-hidden">
                        <div className="relative space-y-5">
                          
                          {/* 1. Header: おススメと構造を統一 */}
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[9px] font-black tracking-widest uppercase">
                                {content.content_label}
                              </span>
                              <span className="text-[10px] font-bold text-slate-300 tracking-wider">
                                Lv.{content.difficulty_level}
                              </span>
                            </div>

                            {/* お気に入りトグル：ここだけは「操作」のためにStarを維持 */}
                            <button
                              onClick={(e) => handleToggleFavorite(e, content.content_id, content.is_favorite)}
                              className={`p-2 -mr-2 transition-all active:scale-75 ${
                                content.is_favorite ? 'text-amber-400' : 'text-slate-200 hover:text-slate-300'
                              }`}
                            >
                              <Star size={22} fill={content.is_favorite ? "currentColor" : "none"} strokeWidth={2.5} />
                            </button>
                          </div>

                          {/* 2. Content: タイトルと説明文 */}
                          <div className="space-y-3">
                            {/* タイトル：クリックで学習開始 */}
                            <h3 
                              onClick={() => router.push(getTrainingPath(content))}
                              className="inline-block text-[18px] font-[1000] text-slate-800 tracking-tight leading-tight cursor-pointer hover:text-indigo-600 transition-colors"
                            >
                              {content.content_name}
                            </h3>

                            {/* 説明文エリア */}
                            <div className="relative">
                              <p 
                                ref={(el) => { descriptionRefs.current[content.content_id] = el; }}
                                className={`text-[13px] text-slate-500 font-medium leading-relaxed overflow-hidden ${
                                  isExpanded ? 'line-clamp-none' : 'line-clamp-2'
                                }`}
                                style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical' }}
                              >
                                {content.description}
                              </p>
                              
                              {shouldShowMore && (
                                <button 
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setExpandedIds(prev => ({ ...prev, [content.content_id]: !isExpanded })); 
                                  }}
                                  className="mt-1.5 flex items-center gap-1 text-indigo-400 text-[10px] font-black py-1 hover:text-indigo-600 active:opacity-50 uppercase tracking-wider transition-colors"
                                >
                                  {isExpanded ? 'Show Less' : 'More Details'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* 3. Tags: ライブラリではより控えめに */}
                          <div className="flex flex-wrap gap-1.5">
                            {content.metadata.tags?.map(t => (
                              <span key={t.id} className="px-2 py-0.5 rounded-md border border-slate-100 bg-slate-50/50 text-slate-400 text-[8px] font-black uppercase tracking-wider">
                                #{t.label}
                              </span>
                            ))}
                          </div>

                          {/* 4. Action Button: センター寄せ・スリム版 */}
                          <div className="pt-1">
                            <button 
                              onClick={() => router.push(getTrainingPath(content))}
                              className="w-full h-12 bg-slate-50 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 group-hover:bg-indigo-600 group-hover:gap-5"
                            >
                              <span className="text-indigo-600 font-black text-[11px] tracking-[0.15em] uppercase group-hover:text-white transition-all">
                                Start Learning
                              </span>
                              <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-indigo-600 shadow-sm transition-all group-hover:bg-indigo-500 group-hover:text-white">
                                <ArrowRight size={12} strokeWidth={3} />
                              </div>
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center px-6 text-center space-y-6 overscroll-none"
                  >
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                      <Search className="text-slate-200" size={40} />
                    </div>
                    <div className="space-y-2">
                      <p className="text-slate-900 font-black text-lg">該当する教材が見つかりません</p>
                      <p className="text-slate-400 text-sm font-medium leading-relaxed">
                        条件を変更するか、フィルタを解除して再検索してください。
                      </p>
                    </div>
                    
                    <button 
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedType('All');
                        setSelectedTag('All');
                      }}
                      className="px-8 py-3 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-md shadow-indigo-200 active:scale-95 transition-all"
                    >
                      Reset Filters
                    </button>
                  </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}