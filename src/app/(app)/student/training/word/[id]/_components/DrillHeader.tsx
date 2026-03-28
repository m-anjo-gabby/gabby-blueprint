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
          // 質感修正：背景を白、微細な境界線と影を追加
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all"
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>

        <button 
          onClick={() => setShowIndex(true)}
          className="flex-1 min-w-0 flex flex-col items-center group active:opacity-70 transition-opacity"
        >
          <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.15em] leading-none mb-1.5 truncate w-full text-center px-4">
            {contentName || 'Vocabulary'}
          </span>
          <div className="flex items-center justify-center gap-1.5 w-full">
            <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none truncate">
              {currentWord.word_en}
            </h1>
            {/* 質感修正：hover時に少し動くアニメーション */}
            <ChevronDown size={14} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-y-0.5 transition-all shrink-0" />
          </div>
        </button>

        <div className="w-9 shrink-0" />
      </div>

      {/* 2. プログレスバー & ピルインジケーター */}
      <div className="mt-3 px-8 relative h-6 flex items-center">
        {/* レール背景：質感修正（内側にわずかな影） */}
        <div className="w-full h-[3px] bg-slate-100 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)]" />
        
        {/* 進捗ライン：質感修正（グラデーションと光彩を追加） */}
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

        {/* ピル型マーカー */}
        <div 
          className="absolute transition-all duration-500 ease-out flex items-center justify-center"
          style={{ 
            left: `calc(32px + ( (100% - 64px) * ${progress} / 100 ))`,
          }}
        >
          {/* マーカー本体：質感修正（2層の影、微かな透過、リング色の調整） */}
          <div className="
            bg-white/95 backdrop-blur-[1px]
            ring-[1.5px] ring-indigo-500/20 
            border border-slate-200/50 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.1),0_1px_3px_rgba(0,0,0,0.05)]
            h-[22px] min-w-[60px] px-2.5 rounded-full 
            flex items-center justify-center gap-1.5 z-10
            antialiased -translate-x-1/2
          ">
            <span className="text-[11px] font-black text-indigo-600 tabular-nums leading-none translate-y-[0.5px]">
              {current}
            </span>
            <span className="text-[10px] font-medium text-slate-300 leading-none">
              /
            </span>
            <span className="text-[10px] font-bold text-indigo-400/80 tabular-nums leading-none translate-y-[0.5px]">
              {total}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};