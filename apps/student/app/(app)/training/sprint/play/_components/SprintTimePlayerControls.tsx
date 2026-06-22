'use client';

import React, { useState } from 'react';
import { ArrowRight, RotateCcw, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";

const AVAILABLE_RATES = [0.8, 1.0, 1.2, 1.5];

interface SprintTimePlayerControlsProps {
  onNext: () => void;
  onReplay: () => void;
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
}

export const SprintTimePlayerControls: React.FC<SprintTimePlayerControlsProps> = ({
  onNext,
  onReplay,
  playbackRate,
  onChangePlaybackRate,
}) => {
  const [isRateMenuOpen, setIsRateMenuOpen] = useState<boolean>(false);

  return (
    <div className="w-full max-w-md mx-auto pt-4 sm:pt-6 flex items-center gap-3 relative">
      {/* バックドロップ (メニューが開いている時のみ背面に配置して閉じられるようにする) */}
      {isRateMenuOpen && (
        <div 
          className="fixed inset-0 z-30 cursor-default" 
          onClick={() => setIsRateMenuOpen(false)} 
        />
      )}

      {/* ⏱️ 再生速度調整セクション */}
      <div className={cn(
        "h-14 w-16 shrink-0 flex items-center rounded-2xl border shadow-sm transition-all overflow-visible relative bg-slate-50 border-slate-200",
        isRateMenuOpen ? "z-40" : "z-20"
      )}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsRateMenuOpen(!isRateMenuOpen);
          }}
          className={cn(
            "w-full h-full flex flex-col items-center justify-center transition-all rounded-2xl cursor-pointer hover:bg-slate-100 active:bg-slate-200",
            playbackRate !== 1.0 
              ? "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700 active:bg-indigo-800" 
              : "text-slate-600"
          )}
          title="再生速度を変更"
        >
          <span className="text-[11px] font-black leading-none font-mono">
            {playbackRate.toFixed(1)}
          </span>
          <span className={cn(
            "text-[9px] font-black uppercase tracking-tight mt-0.5",
            playbackRate !== 1.0 ? "text-indigo-100" : "text-slate-400"
          )}>
            Rate
          </span>
        </button>

        {/* ✨ Framer Motion ポップオーバーメニュー */}
        <AnimatePresence>
          {isRateMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: -10, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="absolute bottom-full left-1/2 -translate-x-1/2 bg-white border border-slate-200 shadow-2xl rounded-2xl p-1.5 min-w-[110px] flex flex-col gap-1 z-50 mb-1"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 吹き出しの矢印 */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2.5 h-2.5 bg-white border-b border-r border-slate-200 rotate-45" />

              {AVAILABLE_RATES.map((rate) => {
                const isSelected = playbackRate === rate;
                return (
                  <button
                    key={rate}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChangePlaybackRate(rate);
                      setIsRateMenuOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-xs font-black font-mono rounded-xl transition-all flex items-center justify-between gap-2 cursor-pointer text-left select-none whitespace-nowrap",
                      isSelected 
                        ? "bg-indigo-50 text-indigo-600 font-bold" 
                        : "text-slate-600 hover:bg-slate-100 hover:text-indigo-600 active:bg-slate-200"
                    )}
                  >
                    <span>{rate.toFixed(1)}x</span>
                    {isSelected && <Check size={12} strokeWidth={3} className="text-indigo-600 shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 🎯 Nextボタン */}
      <button
        type="button"
        onClick={onNext}
        className="flex-1 h-14 rounded-2xl bg-indigo-600 text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-[0.97] flex items-center justify-center gap-2 cursor-pointer"
      >
        <span>Next</span>
        <ArrowRight size={16} strokeWidth={3} />
      </button>

      {/* 🔄 最初から再生ボタン */}
      <button
        type="button"
        onClick={onReplay}
        className="h-14 w-14 shrink-0 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
        title="最初から再生"
      >
        <RotateCcw size={16} strokeWidth={2.5} className="text-slate-500" />
      </button>
    </div>
  );
};