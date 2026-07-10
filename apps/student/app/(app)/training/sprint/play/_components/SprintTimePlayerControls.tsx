// apps\student\app\(app)\training\sprint\play\_components\SprintTimePlayerControls.tsx
'use client';

import React, { useState } from 'react';
import { ArrowRight, Check, Mic, FastForward, Loader2, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";
import { useSprintStore } from '@/stores/useSprintStore';

const AVAILABLE_RATES = [0.8, 1.0, 1.2, 1.5];

interface SprintTimePlayerControlsProps {
  onNext: () => void;      // 発話完了 / 次へ（結果をコミットして進む）
  onSkip: () => void;      // スキップして次へ（スキップフラグを立てて進む）
  audioPhase: 'idle' | 'statement' | 'question' | 'answer'; // 💡 thinking から answer へ変更
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
  isSaving?: boolean;
  isRecording?: boolean;   // 🌟 追加
}

export const SprintTimePlayerControls: React.FC<SprintTimePlayerControlsProps> = ({
  onNext,
  onSkip,
  audioPhase,
  playbackRate,
  onChangePlaybackRate,
  isSaving = false,
  isRecording = false,     // 🌟 追加
}) => {
  const [isRateMenuOpen, setIsRateMenuOpen] = useState<boolean>(false);
  const currentIndex = useSprintStore((state) => state.currentIndex);
  const totalQuestions = useSprintStore((state) => state.questions.length);

  const isLastStep = currentIndex === totalQuestions - 1;
  const isAudioPlaying = audioPhase === 'statement' || audioPhase === 'question';

  return (
    <div className="w-full max-w-md mx-auto pt-4 sm:pt-6 flex items-center justify-between gap-4 relative select-none">
      {/* バックドロップ */}
      {isRateMenuOpen && (
        <div 
          className="fixed inset-0 z-30 cursor-default" 
          onClick={() => setIsRateMenuOpen(false)} 
        />
      )}

      {/* ⏱️ ① 再生速度調整（左固定） */}
      <div className={cn(
        "h-14 w-16 shrink-0 flex items-center rounded-2xl border shadow-sm transition-all overflow-visible relative bg-slate-50 border-slate-200",
        isRateMenuOpen ? "z-40" : "z-20"
      )}>
        <button
          type="button"
          disabled={isSaving}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsRateMenuOpen(!isRateMenuOpen);
          }}
          className={cn(
            "w-full h-full flex flex-col items-center justify-center transition-all rounded-2xl cursor-pointer hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30",
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

        {/* Framer Motion ポップオーバー */}
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

      {/* 🎯 ② 中央メインアクション：不要になったため削除し、左右の余白は justify-between で担保 */}

      {/* ⏭️ ③ Skip ボタン（右配置・発話ボタンの代わりとして大きく押しやすく最適化） */}
      <button
        type="button"
        onClick={onSkip}
        disabled={isSaving}
        className="flex-1 h-14 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-20 disabled:pointer-events-none shadow-sm"
        title="この問題をスキップして次へ"
      >
        <FastForward size={16} strokeWidth={2.5} />
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Skip Question</span>
      </button>
    </div>
  );
};