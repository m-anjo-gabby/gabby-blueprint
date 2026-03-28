'use client';

import React from 'react';
import { ChevronLeft, List, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWordDrillStore } from '@/stores/useWordDrillStore';

/**
 * Propsを排除し、Storeから直接状態を取得
 */
export const DrillHeader: React.FC = () => {
  const router = useRouter();
  
  // Storeから必要な値とアクションを抽出
  const contentName = useWordDrillStore((state) => state.contentName);
  const words = useWordDrillStore((state) => state.words);
  const wordIdx = useWordDrillStore((state) => state.wordIdx);
  const setShowIndex = useWordDrillStore((state) => state.setShowIndex);
  
  const currentWord = words[wordIdx];

  // データがない場合のフォールバック
  if (!currentWord) return <div className="h-24 animate-pulse bg-slate-50 rounded-2xl" />;

  return (
    <div className="shrink-0 border-b border-slate-50 pb-3 sm:pb-5">
      {/* 上段: バックボタン & コーパス名 */}
      <div className="flex justify-between items-center mb-4">
        <button 
          onClick={() => router.back()} 
          className="group text-slate-400 hover:text-indigo-600 flex items-center text-[10px] font-black tracking-widest transition-colors p-1 -ml-1"
        >
          <ChevronLeft size={20} className="mr-0.5 group-hover:-translate-x-0.5 transition-transform" /> 
          BACK
        </button>
        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider truncate max-w-[150px] sm:max-w-none">
          {contentName || 'Vocabulary Training'} 
        </span>
      </div>

      {/* 下段: 左に単語、右に進捗数 */}
      <div className="flex justify-between items-end gap-3">
        <div className="min-w-0 flex-1">
          <button 
            onClick={() => setShowIndex(true)} 
            className="group flex flex-col items-start transition-all -ml-2 px-2 py-1 rounded-2xl hover:bg-slate-50 text-left w-full sm:w-auto"
          >
            <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
              <List size={12} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Vocabulary</span>
            </div>
            <div className="flex items-start gap-2 w-full">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-[1.1] break-words">
                {currentWord.word_en}
              </h1>
              <ChevronDown size={18} className="shrink-0 text-slate-300 group-hover:text-indigo-500 group-hover:translate-y-0.5 transition-all mt-1" />
            </div>
          </button>
        </div>

        <div className="shrink-0 text-right bg-slate-50 px-3 py-1 rounded-xl border border-slate-100/50 mb-1 self-end">
          <span className="text-lg font-black text-indigo-600 tabular-nums">
            {wordIdx + 1}
          </span>
          <span className="text-xs font-bold text-slate-200 mx-1">/</span>
          <span className="text-xs font-bold text-slate-400 tabular-nums">
            {words.length}
          </span>
        </div>
      </div>
    </div>
  );
};