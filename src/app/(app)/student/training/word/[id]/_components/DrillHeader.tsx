'use client';

import React from 'react';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWordDrillStore } from '@/stores/useWordDrillStore';

export const DrillHeader: React.FC = () => {
  const router = useRouter();
  const { contentName, words, wordIdx, setShowIndex } = useWordDrillStore();
  
  const currentWord = words[wordIdx];
  const total = words.length;
  const current = wordIdx + 1;

  const progress = total > 1 ? (wordIdx / (total - 1)) * 100 : 0;

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
          {/* 教材名を「バッジ風」 */}
            <div className="mb-2 px-2.5 py-0.5 rounded-full bg-slate-100/80 group-hover:bg-indigo-50 transition-colors">
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
              <ChevronDown size={16} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-y-0.5 transition-all ml-1 shrink-0" />
            </div>
        </button>

        <div className="w-9 shrink-0" />
      </div>

      {/* 2. プログレスバー & ピルインジケーター */}
      <div className="mt-3 px-8 relative h-6 flex items-center">
        {/* レール背景 */}
        <div className="w-full h-[3px] bg-slate-100 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)]" />
        
        {/* 進捗ライン */}
        <div 
          className="absolute h-[3px] rounded-full transition-all duration-500 ease-out origin-left bg-gradient-to-r from-indigo-600 to-indigo-400 shadow-[0_0_7px_rgba(79,70,229,0.4)]"
          style={{ 
            left: '32px',
            right: '32px',
            width: 'auto',
            transformOrigin: 'left',
            transform: `scaleX(${progress / 100})`
          }}
        />

        {/* ピル型マーカーをボタン化 */}
        <div 
          className="absolute transition-all duration-500 ease-out flex items-center justify-center"
          style={{ 
            left: `calc(32px + ( (100% - 64px) * ${progress} / 100 ))`,
          }}
        >
          {/* 変更：div から button に変更し、クリックイベントを追加 */}
          <button
            onClick={() => setShowIndex(true)}
            className="
              bg-white/95 backdrop-blur-[1px]
              ring-[1.5px] ring-indigo-500/20 
              border border-slate-200/50 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.1),0_1px_3px_rgba(0,0,0,0.05)]
              h-[22px] min-w-[60px] px-2.5 rounded-full 
              flex items-center justify-center gap-1.5 z-10
              antialiased -translate-x-1/2
              cursor-pointer hover:bg-white hover:ring-indigo-500/40 
              active:scale-90 transition-all duration-200
            "
          >
            <span className="text-[11px] font-black text-indigo-600 tabular-nums leading-none translate-y-[0.5px]">
              {current}
            </span>
            <span className="text-[10px] font-medium text-slate-300 leading-none">/</span>
            <span className="text-[10px] font-bold text-indigo-400/80 tabular-nums leading-none translate-y-[0.5px]">
              {total}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};