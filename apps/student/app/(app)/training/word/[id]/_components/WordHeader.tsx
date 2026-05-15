'use client';

import React from 'react';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWordDrillStore } from '@/stores/useWordDrillStore';
import { getCefrStyle } from '@gabby/lib/content/ui';
import { cn } from '@/lib/utils';

export const WordHeader: React.FC = () => {
  const router = useRouter();
  const { contentName, cefr, words, wordIdx, setShowIndex } = useWordDrillStore();
  
  const currentWord = words[wordIdx];
  const total = words.length;
  const current = wordIdx + 1;

  const progress = total > 0 ? ((wordIdx + 1) / total) * 100 : 0;

  if (!currentWord) return <div className="h-16 animate-pulse bg-slate-50 rounded-xl mb-4" />;

  return (
    <div className="shrink-0 pt-1 w-full overflow-hidden select-none">
      {/* 1. ナビゲーション・タイトルエリア */}
      <div className="flex items-center justify-between gap-2 h-12 px-2">
        <button 
          onClick={() => router.back()} 
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all"
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>

        {/* 語彙テキスト部分も引き続きクリック可能 */}
        <button 
          onClick={() => setShowIndex(true)}
          className="flex-1 min-w-0 flex flex-col items-center group active:opacity-70 transition-opacity"
        >
          {/* 教材名バッジ（CEFRレベルを統合） */}
          <div className="mb-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100/80 group-hover:bg-indigo-50 transition-colors">
            {cefr && (
              <span className={cn(
                "px-1 py-0.5 rounded-[4px] text-[7px] font-black leading-none uppercase",
                getCefrStyle(cefr.id)
              )}>
                {cefr.label}
              </span>
            )}
            <span className="text-[8px] font-black text-slate-400 group-hover:text-indigo-400 uppercase tracking-[0.2em] leading-none block whitespace-nowrap">
              {contentName || 'Vocabulary'}
            </span>
          </div>

          {/* 単語*/}
          <div className="flex items-center justify-center gap-1.5 w-full">
            <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none truncate translate-x-2">
              {currentWord.word_en}
            </h1>
            {/* アイコン */}
            <ChevronDown size={20} className="text-slate-400 group-hover:text-indigo-500 group-hover:translate-y-0.5 transition-all ml-1 shrink-0" />
          </div>
        </button>

        <div className="w-9 shrink-0" />
      </div>

      {/* 2. プログレスバー */}
      <div className="mt-2 px-6 pb-4">
      <div className="flex justify-between items-end mb-1.5 px-0.5">
        <div className="flex items-baseline gap-1">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">
            Word
          </span>
          <span className="text-[11px] font-black text-indigo-600 ml-1 tabular-nums">
            {current}
          </span>
          <span className="text-[9px] font-bold text-slate-300">/</span>
          <span className="text-[10px] font-bold text-slate-400 tabular-nums">
            {total}
          </span>
        </div>
        <span className="text-[10px] font-black text-slate-400 tabular-nums">
          {Math.round(progress)}%
        </span>
      </div>
        
        {/* プログレスバー本体 */}
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner relative">
          <div 
            className="absolute top-0 left-0 h-full bg-indigo-600 transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};