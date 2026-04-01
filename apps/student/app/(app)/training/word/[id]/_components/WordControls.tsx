'use client';

import React, { useMemo, useCallback } from 'react';
import { Bookmark, ArrowRight, ArrowLeft, RotateCw, Volume2, Mic, Check, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWordDrillStore } from '@/stores/useWordDrillStore';
import { cn } from "@/lib/utils";

interface WordControlsProps {
  isListening: boolean;
  timeLeft: number;
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onSaveResume: () => void;
  onToggleAutoPlay: () => void;
  onSpeak: () => void;
  onVoiceCheck: () => void;
}

/**
 * 学習画面のメイン操作パネル
 * 上下2段の「スプリットボタン構造」により、高い機能性と誤操作防止を両立
 */
export const WordControls: React.FC<WordControlsProps> = ({
  isListening,
  timeLeft,
  playbackRate,
  onChangePlaybackRate,
  onNext,
  onPrev,
  onSaveResume,
  onToggleAutoPlay,
  onSpeak,
  onVoiceCheck,
}) => {
  const { isAutoPlaying, words, wordIdx, phraseIdx } = useWordDrillStore();

  // --- 状態判定ロジック ---
  const currentWord = words[wordIdx];
  const isLastStep = useMemo(() => 
    wordIdx === words.length - 1 && 
    phraseIdx === (currentWord?.phrases.length || 0) - 1
  , [wordIdx, words.length, phraseIdx, currentWord]);

  const isFirstStep = wordIdx === 0 && phraseIdx === 0;
  const isInteractionDisabled = isListening || isAutoPlaying;

  /**
   * 再生速度をサイクル切替 (1.0 -> 1.2 -> 1.5 -> 0.8 -> 1.0)
   */
  const handleCycleRate = useCallback(() => {
    const rates = [1.0, 1.2, 1.5, 0.8];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    onChangePlaybackRate(rates[nextIndex]);
  }, [playbackRate, onChangePlaybackRate]);

  // --- 共通スタイル定義 ---
  const sideBtnBase = "w-11 h-11 shrink-0 flex items-center justify-center rounded-2xl transition-all active:scale-90 disabled:opacity-20 disabled:pointer-events-none border border-slate-100 bg-slate-50";
  const unitBase = "flex items-center rounded-2xl border overflow-hidden shadow-sm transition-all";
  const splitLeftBase = "w-14 h-full flex flex-col items-center justify-center transition-all shrink-0 border-r";

  return (
    <div className="shrink-0 w-full max-w-md mx-auto flex flex-col items-center select-none pt-2 gap-y-4 px-4 pb-2">
      
      {/* 1. ステータス・インジケーター（録音中や自動再生の状態表示） */}
      <div className="h-6 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {isListening ? (
            <motion.div key="rec" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Recording {timeLeft}s</span>
            </motion.div>
          ) : isAutoPlaying ? (
            <motion.div key="auto" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex items-center gap-2">
              <RotateCw size={10} className="animate-spin text-indigo-600" />
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Auto Playing</span>
            </motion.div>
          ) : (
            <motion.span key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
              Tap Card to Flip
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* 2. 上段：ナビゲーション・レイヤー（戻る・進む・保存） */}
      <div className="flex items-center justify-between w-full gap-2 h-14">
        {/* ブックマーク・保存ボタン */}
        <button
          onClick={onSaveResume}
          disabled={isAutoPlaying}
          className={cn(sideBtnBase, "hover:bg-indigo-50 hover:text-indigo-600")}
        >
          <Bookmark size={18} strokeWidth={2.5} className="text-slate-400" />
        </button>

        {/* スプリット・ナビゲーションユニット（ボーダーは控えめなindigo-100） */}
        <div className={cn("flex-1 h-full bg-white border-indigo-100", unitBase)}>
          {/* 戻るボタン：白背景に薄いグレーのアクション */}
          <button 
            onClick={onPrev} 
            disabled={isInteractionDisabled || isFirstStep} 
            className={cn(splitLeftBase, "text-slate-400 hover:bg-slate-50 border-indigo-50")}
          >
            <ArrowLeft size={18} strokeWidth={3} />
          </button>
          
          {/* 次へ/完了ボタン：塗りつぶしで最重要アクションを強調 */}
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
            <span className="text-[10px] font-black uppercase tracking-[0.15em] tabular-nums">
              {isLastStep ? 'Finish' : 'Next'}
            </span>
            {isLastStep ? <Check size={18} strokeWidth={3} /> : <ArrowRight size={18} strokeWidth={3} />}
          </button>
        </div>

        {/* 自動再生トグル */}
        <button
          onClick={onToggleAutoPlay}
          className={cn(
            sideBtnBase,
            isAutoPlaying ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" : "hover:bg-indigo-50 hover:text-indigo-600"
          )}
        >
          <RotateCw size={18} strokeWidth={2.5} className={cn(isAutoPlaying ? "text-white animate-spin-slow" : "text-slate-400")} />
        </button>
      </div>

      {/* 3. 下段：アクション・レイヤー（再生速度・聴く・練習する） */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm px-2 mt-1 h-14">
        
        {/* スプリット・オーディオユニット（速度設定 + 再生） */}
        <div className={cn("h-full bg-slate-50 border-slate-200", unitBase)}>
          {/* 速度切り替えセクション：等速(1.0)以外でIndigoベタ塗りに強調 */}
          <button
            onClick={handleCycleRate}
            disabled={isInteractionDisabled}
            className={cn(
              splitLeftBase,
              playbackRate !== 1.0 
                ? "bg-indigo-600 text-white border-indigo-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]" 
                : "text-slate-400 border-slate-200 hover:bg-slate-100 active:bg-slate-200"
            )}
          >
            {/* iPhone対策で10pxを維持しつつ、字間を詰めてバランスを調整 */}
            <span className="text-[10px] font-black leading-none">{playbackRate.toFixed(1)}</span>
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-tighter",
              playbackRate !== 1.0 ? "opacity-90" : "opacity-70"
            )}>Rate</span>
          </button>

          {/* 音声再生セクション */}
          <button
            onClick={onSpeak}
            disabled={isInteractionDisabled}
            className={cn("flex-1 h-full flex items-center justify-center gap-2 text-slate-600 hover:text-indigo-600 transition-all")}
          >
            <Volume2 size={20} strokeWidth={2.5} />
            <span className="text-[10px] font-black uppercase tracking-widest hidden xs:block">Listen</span>
          </button>
        </div>

        {/* 音声認識・練習ボタン（単体で最も強いアクションのためスプリットにせず強調） */}
        <button
          onClick={onVoiceCheck}
          disabled={isAutoPlaying}
          className={cn(
            "h-full rounded-2xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all overflow-hidden relative",
            isListening ? "bg-rose-500 text-white shadow-md active:scale-95" : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.97]",
            isAutoPlaying && "opacity-20 disabled:pointer-events-none"
          )}
        >
          {isListening && <span className="absolute inset-0 bg-white/20 animate-pulse" />}
          
          <AnimatePresence mode="wait">
            {isListening ? (
              <motion.div key="stop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 relative z-10">
                <Square size={14} fill="currentColor" strokeWidth={0} />
                <span className="tracking-[0.1em]">Stop</span>
              </motion.div>
            ) : (
              <motion.div key="mic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 relative z-10">
                <Mic size={20} strokeWidth={2.5} />
                <span className="hidden xs:block tracking-[0.1em]">Practice</span>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

    </div>
  );
};