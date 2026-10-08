'use client';

import React from 'react';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { useWordDrillStore } from '@/stores/useWordDrillStore';
import { getCefrStyle } from '@gabby/lib/content/ui';
import { cn } from '@/lib/utils';

interface WordHeaderProps {
  onBack: () => void;
}

export const WordHeader: React.FC<WordHeaderProps> = ({ onBack }) => {
  const { contentName, cefr, words, wordIdx, setShowIndex } = useWordDrillStore();
  
  const currentWord = words[wordIdx];
  const total = words.length;
  const current = wordIdx + 1;

  const progress = total > 0 ? ((wordIdx + 1) / total) * 100 : 0;

  if (!currentWord) return <div className="h-16 animate-pulse bg-canvas rounded-xl mb-4" />;

  return (
    <div className="shrink-0 pt-1 w-full overflow-hidden select-none">
      {/* 1. ナビゲーション・タイトルエリア */}
      <div className="flex items-center justify-between gap-2 h-12 px-2">
        <button 
          onClick={onBack} 
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-white text-ink-subtle border border-line/60 shadow-sm hover:bg-canvas hover:text-brand active:scale-95 transition-all"
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>

        {/* 語彙テキスト部分も引き続きクリック可能 */}
        <button 
          onClick={() => setShowIndex(true)}
          className="flex-1 min-w-0 flex flex-col items-center group active:opacity-70 transition-opacity"
        >
          {/* 教材名バッジ（CEFRレベルを統合） */}
          <div className="mb-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-canvas/80 group-hover:bg-brand-50 transition-colors">
            {cefr && (
              <span className={cn(
                "px-1 py-0.5 rounded-sm text-[11px] font-bold leading-none",
                getCefrStyle(cefr.id)
              )}>
                {cefr.label}
              </span>
            )}
            <span className="text-[11px] font-bold text-ink-subtle group-hover:text-brand-400 leading-none block whitespace-nowrap">
              {contentName || '単語帳'}
            </span>
          </div>

          {/* 単語*/}
          <div className="flex items-center justify-center gap-1.5 w-full">
            <h1 className="text-xl font-bold text-ink tracking-tight leading-none truncate translate-x-2">
              {currentWord.word_en}
            </h1>
            {/* アイコン */}
            <ChevronDown size={20} className="text-ink-subtle group-hover:text-brand-500 group-hover:translate-y-0.5 transition-all ml-1 shrink-0" />
          </div>
        </button>

        <div className="w-9 shrink-0" />
      </div>

      {/* 2. プログレスバー */}
      <div className="mt-2 px-6 pb-4">
      <div className="flex justify-between items-end mb-1.5 px-0.5">
        <div className="flex items-baseline gap-1">
          <span className="text-[11px] font-bold text-ink-subtle tracking-tight">
            単語
          </span>
          <span className="text-[11px] font-bold text-brand ml-1 tabular-nums">
            {current}
          </span>
          <span className="text-[11px] font-bold text-ink-subtle">/</span>
          <span className="text-[11px] font-bold text-ink-subtle tabular-nums">
            {total}
          </span>
        </div>
        <span className="text-[11px] font-bold text-ink-subtle tabular-nums">
          {Math.round(progress)}%
        </span>
      </div>
        
        {/* プログレスバー本体 */}
        <div className="h-1.5 w-full bg-canvas rounded-full overflow-hidden shadow-inner relative">
          <div 
            className="absolute top-0 left-0 h-full bg-brand transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};