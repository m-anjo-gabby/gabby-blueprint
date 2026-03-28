'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import { useWordDrillStore } from '@/stores/useWordDrillStore';
import { motion, AnimatePresence } from 'framer-motion';

interface DrillIndexProps {
  isOpen: boolean;
  onSelect: (idx: number) => void;
}

export const DrillIndex: React.FC<DrillIndexProps> = ({ isOpen, onSelect }) => {
  const activeWordRef = useRef<HTMLButtonElement | null>(null);

  // Store から状態とアクションを抽出
  const words = useWordDrillStore((state) => state.words);
  const currentIdx = useWordDrillStore((state) => state.wordIdx);
  const sortOrder = useWordDrillStore((state) => state.sortOrder);
  const setSortOrder = useWordDrillStore((state) => state.setSortOrder);
  const setShowIndex = useWordDrillStore((state) => state.setShowIndex);

  // 1. ソート済みリストの生成（元のインデックスを保持）
  const displayWords = useMemo(() => {
    const listWithIdx = words.map((w, originalIdx) => ({ ...w, originalIdx }));
    if (sortOrder === 'alpha') {
      return [...listWithIdx].sort((a, b) => a.word_en.localeCompare(b.word_en));
    }
    return listWithIdx;
  }, [words, sortOrder]);

  // 2. A-Zナビゲーション用のユニークな頭文字リスト
  const alphabetIndex = useMemo(() => {
    if (sortOrder !== 'alpha') return [];
    const initials = displayWords.map(w => w.word_en.charAt(0).toUpperCase());
    return Array.from(new Set(initials)).sort();
  }, [displayWords, sortOrder]);

  // 現在の単語位置まで自動スクロール
  useEffect(() => {
    if (isOpen && activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }, [isOpen, sortOrder]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="absolute inset-0 z-[100] bg-white/98 backdrop-blur-md p-8 flex flex-col"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        >
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Select Word</span>
            <button 
              onClick={() => setShowIndex(false)} 
              className="text-slate-400 hover:text-slate-900 font-bold text-xs uppercase tracking-widest p-2"
            >
              Close
            </button>
          </div>

          {/* Sort Tabs */}
          <div className="flex gap-4 mb-6 border-b border-slate-100 shrink-0">
            {(['default', 'alpha'] as const).map((mode) => (
              <button 
                key={mode}
                onClick={() => setSortOrder(mode)}
                className={`pb-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                  sortOrder === mode ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-300'
                }`}
              >
                {mode === 'default' ? 'By Rank' : 'A to Z'}
              </button>
            ))}
          </div>

          <div className="flex-1 flex overflow-hidden relative">
            {/* Main List Area */}
            <div className="flex-1 overflow-y-auto pr-4 space-y-1 custom-scrollbar">
              {displayWords.map((w, idx) => {
                const currentInitial = w.word_en.charAt(0).toUpperCase();
                const prevInitial = idx > 0 ? displayWords[idx - 1].word_en.charAt(0).toUpperCase() : null;
                const showSection = sortOrder === 'alpha' && currentInitial !== prevInitial;

                return (
                  <div key={`section-${w.word_id}`}>
                    {showSection && (
                      <div id={`section-head-${currentInitial}`} className="px-4 py-4 mt-2 mb-1 scroll-mt-4">
                        <span className="text-xl font-black text-indigo-200 italic tracking-tighter">
                          {currentInitial}
                        </span>
                        <div className="h-px w-full bg-slate-50 mt-1" />
                      </div>
                    )}

                    <button
                      ref={currentIdx === w.originalIdx ? activeWordRef : null}
                      onClick={() => onSelect(w.originalIdx)}
                      className={`w-full text-left px-4 py-3 rounded-2xl transition-all flex items-center gap-3 group ${
                        currentIdx === w.originalIdx 
                          ? 'bg-indigo-50 border border-indigo-100 ring-1 ring-indigo-100' 
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0 flex flex-col py-0.5">
                        <span className={`text-sm font-bold leading-tight break-words ${
                          currentIdx === w.originalIdx ? 'text-indigo-600' : 'text-slate-700'
                        }`}>
                          {sortOrder === 'default' ? `${w.originalIdx + 1}. ` : ''}{w.word_en}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400 mt-0.5 break-words">
                          {w.word_ja}
                        </span>
                      </div>
                      {currentIdx === w.originalIdx && (
                        <div className="shrink-0 w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Quick Nav (A-Z) */}
            {sortOrder === 'alpha' && alphabetIndex.length > 0 && (
              <div className="flex flex-col justify-center gap-1 pl-2 border-l border-slate-50 shrink-0">
                {alphabetIndex.map(char => (
                  <button
                    key={char}
                    onClick={() => {
                      const element = document.getElementById(`section-head-${char}`);
                      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="text-[10px] font-black text-slate-300 hover:text-indigo-600 w-6 h-6 flex items-center justify-center rounded-full hover:bg-indigo-50 transition-all"
                  >
                    {char}
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};