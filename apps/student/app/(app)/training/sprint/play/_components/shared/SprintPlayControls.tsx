'use client';

import React from 'react';
import { ArrowRight, ArrowLeft, RotateCw, Volume2, Mic, Check, Square, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";

// 🔌 Zustand ストアのインポート
import { useSprintStore } from '@/stores/useSprintStore';

interface SprintPlayControlsProps {
  onNext: () => void;
  onPrev: () => void;
  onPlayAudio: () => void; // 💡 Listen 押下（プレイヤー側で制御）
  onStartRecord: () => void;
  onStopRecord: () => void;
  onToggleAutoPlay?: () => void; // ➕ 自動再生トグル
  playbackRate: number;
  onChangePlaybackRate: () => void;
  timeLeft: number;
  isStarted?: boolean; // 🛡️ ➕ iOS対策：初期ウェルカム画面を突破したかどうかのフラグ
}

/**
 * スプリントドリル用のメイン操作パネル（Zustand 同期版）
 */
export const SprintPlayControls: React.FC<SprintPlayControlsProps> = ({
  onNext,
  onPrev,
  onPlayAudio,
  onStartRecord,
  onStopRecord, // Keep onStopRecord as it's part of the core recording functionality
  onToggleAutoPlay,
  playbackRate,
  onChangePlaybackRate,
  timeLeft,
  isStarted = true // 💡 デフォルトはtrueにすることで他画面での影響を防止
}) => {
  // 🔌 Zustand ストアから状態を直接マッピング
  const currentIndex = useSprintStore((state) => state.currentIndex);
  const totalQuestions = useSprintStore((state) => state.questions.length);
  const isRevealed = useSprintStore((state) => state.isRevealed);
  const isRecording = useSprintStore((state) => state.isRecording);
  const isAutoPlaying = useSprintStore((state) => state.isAutoPlaying);
  const isPlayingQuestionSequence = useSprintStore((state) => state.isPlayingQuestionSequence);
  const isPlayingAnswerSequence = useSprintStore((state) => state.isPlayingAnswerSequence);

  // 🤖 内部合成フラグ
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === totalQuestions - 1;
  const isPlaying = isPlayingQuestionSequence || isPlayingAnswerSequence;

  // 🛡️ 変更点：まだウェルカムオーバーレイを突破していない場合は、無条件ですべての操作をロックする
  const isInteractionDisabled = !isStarted || isRecording || isAutoPlaying || isPlaying;
  const isManualPlaying = isPlaying && !isAutoPlaying;

  // --- 共通スタイル定義 ---
  const sideBtnBase = "w-11 h-11 shrink-0 flex items-center justify-center rounded-2xl transition-all active:scale-90 disabled:opacity-20 disabled:pointer-events-none border border-slate-100 bg-slate-50 text-slate-400";
  const unitBase = "flex items-center rounded-2xl border overflow-hidden shadow-sm transition-all";
  const splitLeftBase = "w-14 h-full flex flex-col items-center justify-center transition-all shrink-0 border-r";

  return (
    <div className="shrink-0 w-full max-w-md mx-auto flex flex-col items-center select-none pt-2 gap-y-4 px-4 pb-2">

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 1. 上段：ナビゲーション・レイヤー（戻る・進む・ブックマーク） */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between w-full gap-2 h-14">        

        {/* スプリット・ナビゲーションユニット */}
        <div className={cn("flex-1 h-full bg-white border-indigo-100", unitBase)}>
          
          {/* 左スプリット：戻る（Prev）ボタン */}
          <button 
            onClick={onPrev} 
            disabled={isInteractionDisabled || isFirstStep} 
            className={cn(splitLeftBase, "text-slate-400 hover:bg-slate-50 border-indigo-50 disabled:opacity-20")}
          >
            <ArrowLeft size={18} strokeWidth={3} />
          </button>
          
          {/* 右スプリット：次へ（Next）/ 完了（Finish）ボタン */}
          <button 
            onClick={onNext} 
            disabled={isInteractionDisabled} 
            className={cn(
              "flex-1 h-full flex items-center justify-center gap-2 transition-all active:brightness-90 disabled:opacity-40",
              isLastStep 
                ? "bg-emerald-500 text-white shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]" 
                : "bg-indigo-600 text-white shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]"
            )}
          >
            <span className="text-[10px] font-black uppercase tracking-[0.15em]">
              {isLastStep ? 'Finish' : 'Next'}
            </span>
            {isLastStep ? <Check size={18} strokeWidth={3} /> : <ArrowRight size={18} strokeWidth={3} />}
          </button>
        </div>

        {/* 右サイド：自動再生（AutoPlay）トグル */}
        <button
          onClick={onToggleAutoPlay}
          disabled={!isStarted || isManualPlaying} // 💡 !isStarted を追加
          className={cn(
            sideBtnBase, 
            isAutoPlaying ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" : "hover:bg-indigo-50 hover:text-indigo-600"
          )}
        >
          <RotateCw size={18} strokeWidth={2.5} className={cn(isAutoPlaying ? "text-white animate-spin-slow" : "text-slate-400")} />
        </button>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 2. 下段：アクション・レイヤー（再生速度 ＋ マイク録音） */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm px-2 mt-1 h-14">
        
        {/* 左側：「Rate切り替え ＋ Listen」ハイブリッドユニット */}
        <div className={cn("h-full bg-slate-50 border-slate-200", unitBase)}>
          {/* 再生速度セクション */}
          <button
            onClick={onChangePlaybackRate}
            disabled={isInteractionDisabled}
            className={cn(
              splitLeftBase,
              playbackRate !== 1.0 
                ? "bg-indigo-600 text-white border-indigo-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]" 
                : "text-slate-400 border-slate-200 hover:bg-slate-100 active:bg-slate-200"
            )}
          >
            <span className="text-[10px] font-black leading-none">{playbackRate.toFixed(1)}</span>
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-tighter",
              playbackRate !== 1.0 ? "opacity-90" : "opacity-70"
            )}>Rate</span>
          </button>

          {/* 音声再生（Listen）セクション */}
          <button
            onClick={onPlayAudio}
            disabled={isInteractionDisabled}
            className={cn("flex-1 h-full flex items-center justify-center transition-all",
              isManualPlaying ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:text-indigo-600"
            )}
          >
            {isManualPlaying ? (
              <RotateCw size={20} strokeWidth={2.5} className="animate-spin" />
            ) : (
              <Volume2 size={20} strokeWidth={2.5} />
            )}
          </button>
        </div>

        {/* 右側：音声認識・練習ボタン */}
        <button
          onClick={isRecording ? onStopRecord : onStartRecord}
          disabled={(isInteractionDisabled && !isRecording) || isManualPlaying}
          className={cn("h-full rounded-2xl flex items-center justify-center font-black text-[10px] uppercase tracking-widest transition-all overflow-hidden relative",
            isRecording ? "bg-rose-500 text-white shadow-md active:scale-95" : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.97]",
            ((isInteractionDisabled && !isRecording) || isManualPlaying) && "opacity-20 disabled:pointer-events-none"
          )}
        >
          {isRecording && <span className="absolute inset-0 bg-white/20 animate-pulse" />}
          
          <AnimatePresence mode="wait">
            {isRecording ? (
              <motion.div key="stop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center relative z-10">
                <Square size={14} fill="currentColor" strokeWidth={0} />
              </motion.div>
            ) : (
              <motion.div key="mic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center relative z-10">
                <Mic size={20} strokeWidth={2.5} />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

    </div>
  );
};