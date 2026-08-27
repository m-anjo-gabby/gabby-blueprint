'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";

export const PLAYBACK_RATES = [0.8, 1.0, 1.2, 1.5] as const;

interface PlaybackRateControlProps {
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  /** 呼び出し元画面ごとの既存デザイン（トリガーボタンの文字サイズ・配色）を再現するプリセット */
  variant?: 'word' | 'sprint';
}

const TRIGGER_STYLES = {
  word: {
    base: "w-14 h-full flex flex-col items-center justify-center transition-all shrink-0 border-r relative rounded-l-2xl",
    selected: "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700 active:bg-indigo-800",
    unselected: "text-slate-400 border-slate-200 hover:bg-slate-100 active:bg-slate-200",
    value: "text-[10px] font-black leading-none",
    label: "text-[10px] font-bold uppercase tracking-tighter",
    labelSelected: "opacity-90",
    labelUnselected: "opacity-70",
  },
  sprint: {
    base: "w-14 h-full flex flex-col items-center justify-center transition-all shrink-0 border-r relative rounded-l-2xl border-slate-200 hover:bg-slate-100 active:bg-slate-200 cursor-pointer z-10",
    selected: "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700 active:bg-indigo-800",
    unselected: "text-slate-600",
    value: "text-[11px] font-black leading-none",
    label: "text-[9px] font-black uppercase tracking-tight mt-0.5",
    labelSelected: "text-indigo-100",
    labelUnselected: "text-slate-400",
  },
} as const;

/**
 * 再生速度選択ポップオーバー。Word/Sprintドリルの操作パネルで共通利用。
 * 開閉は呼び出し元（isRateMenuOpen/setIsRateMenuOpen 相当）が制御する
 * controlled コンポーネントとし、外側タップで閉じるバックドロップは内包する。
 * トリガーボタンの文字サイズ・配色は既存デザインを維持するため variant で出し分ける。
 */
export const PlaybackRateControl: React.FC<PlaybackRateControlProps> = ({
  playbackRate,
  onChangePlaybackRate,
  isOpen,
  onOpenChange,
  disabled = false,
  variant = 'word',
}) => {
  const s = TRIGGER_STYLES[variant];
  const isRateActive = playbackRate !== 1.0;

  return (
    <div className="h-full relative shrink-0 overflow-visible">
      {isOpen && (
        <div
          className="fixed inset-0 z-30 cursor-default"
          onClick={() => onOpenChange(false)}
        />
      )}

      <button
        onClick={() => !disabled && onOpenChange(!isOpen)}
        disabled={disabled}
        className={cn(s.base, isRateActive ? s.selected : s.unselected)}
      >
        <span className={s.value}>{playbackRate.toFixed(1)}</span>
        <span className={cn(s.label, isRateActive ? s.labelSelected : s.labelUnselected)}>Rate</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: -10, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 bg-white border border-slate-200/90 shadow-2xl rounded-2xl p-1.5 min-w-[80px] flex flex-col gap-1 z-50 mb-1"
          >
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2.5 h-2.5 bg-white border-b border-r border-slate-200 rotate-45" />

            {PLAYBACK_RATES.map((rate) => {
              const isSelected = playbackRate === rate;
              return (
                <button
                  key={rate}
                  onClick={() => {
                    onChangePlaybackRate(rate);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "w-full px-2.5 py-1.5 text-xs font-black font-mono rounded-xl transition-all flex items-center justify-between gap-2 cursor-pointer",
                    isSelected
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-indigo-500"
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
  );
};
