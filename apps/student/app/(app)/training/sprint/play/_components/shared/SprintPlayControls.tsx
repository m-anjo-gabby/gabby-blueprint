'use client';

import React from 'react';
import { ArrowRight, RotateCw, Volume2, Mic, Check, Square, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";

// 📐 エラーを解消するためにPropsのインターフェースを拡張
interface SprintPlayControlsProps {
  mode: 'drill' | 'sprint';
  isRevealed: boolean;
  isRecording: boolean;
  onReveal: () => void;
  onNext: () => void;
  onPlayAudio: () => void;
  onStartRecord: () => void;
  onStopRecord: () => void;
  hasAudio: boolean;
  
  // ➕ 追加された音声状態管理用のプロパティ
  isPlaying: boolean;
  playbackRate: number;
  onChangePlaybackRate: () => void;
  timeLeft: number;
}

/**
 * スプリントドリル用のメイン操作パネル
 * 単語帳（WordControls）の洗練されたスプリット構造、型定義、アニメーションを100%継承
 */
export const SprintPlayControls: React.FC<SprintPlayControlsProps> = ({
  mode,
  isRevealed,
  isRecording,
  onReveal,
  onNext,
  onPlayAudio,
  onStartRecord,
  onStopRecord,
  hasAudio,
  isPlaying,
  playbackRate,
  onChangePlaybackRate,
  timeLeft
}) => {
  const isInteractionDisabled = isRecording;

  // --- 共通スタイル定義 (WordControlsから完全継承) ---
  const sideBtnBase = "w-11 h-11 shrink-0 flex items-center justify-center rounded-2xl transition-all active:scale-90 disabled:opacity-20 disabled:pointer-events-none border border-slate-100 bg-slate-50 text-slate-400";
  const unitBase = "flex items-center rounded-2xl border overflow-hidden shadow-sm transition-all";
  const splitLeftBase = "w-14 h-full flex flex-col items-center justify-center transition-all shrink-0 border-r";

  return (
    <div className="shrink-0 w-full max-w-md mx-auto flex flex-col items-center select-none pt-2 gap-y-4 px-4 pb-2">
      
      {/* ──────────────────────────────────────────────────────────── */}
      {/* 1. ステータス・インジケーター (WordControlsと100%シンクロするモーション) */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="h-6 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {isRecording ? (
            <motion.div key="rec" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Recording {timeLeft}s</span>
            </motion.div>
          ) : isPlaying ? (
            <motion.div key="play" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex items-center gap-2">
              <RotateCw size={10} className="animate-spin text-indigo-600" />
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Playing</span>
            </motion.div>
          ) : !isRevealed ? (
            <motion.span key="hint-reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
              Tap Eye or Reveal to check answer
            </motion.span>
          ) : (
            <motion.span key="hint-next" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
              Listen & Practice then go Next
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 2. 上段：ナビゲーション・レイヤー（Reveal / Next をスプリット化） */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between w-full gap-2 h-14">
        
        {/* 左サイド：目を模したRevealショートカットボタン（単語帳のBookmark位置） */}
        <button
          onClick={onReveal}
          disabled={isRevealed || isInteractionDisabled || isPlaying}
          className={cn(sideBtnBase, "hover:bg-indigo-50 hover:text-indigo-600 disabled:bg-slate-100 disabled:text-slate-300")}
        >
          <Eye size={18} strokeWidth={2.5} />
        </button>

        {/* スプリット・コントロールユニット */}
        <div className={cn("flex-1 h-full bg-white border-indigo-100", unitBase)}>
          
          {/* 左スプリット：Revealボタン (未回答時はここを目立たせる) */}
          <button 
            onClick={onReveal} 
            disabled={isRevealed || isInteractionDisabled || isPlaying} 
            className={cn(
              "h-full px-4 flex items-center justify-center gap-2 transition-all font-black text-[10px] uppercase tracking-[0.15em]",
              !isRevealed 
                ? "bg-indigo-50 text-indigo-600 font-black" 
                : "text-slate-300 bg-slate-50 pointer-events-none"
            )}
            style={{ width: '84px' }}
          >
            Reveal
          </button>
          
          {/* 右スプリット：次へ(Next)ボタン */}
          <button 
            onClick={onNext} 
            disabled={isInteractionDisabled || isPlaying} 
            className={cn(
              "flex-1 h-full flex items-center justify-center gap-2 transition-all active:brightness-90 disabled:opacity-40",
              isRevealed
                ? "bg-indigo-600 text-white shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            )}
          >
            <span className="text-[10px] font-black uppercase tracking-[0.15em]">
              Next
            </span>
            <ArrowRight size={18} strokeWidth={3} />
          </button>
        </div>

        {/* 右サイド：クイックオーディオ再生トグル（単語帳のAutoPlay位置をインスパイア、再生中はインディゴにハイライト） */}
        <button
          onClick={onPlayAudio}
          disabled={isInteractionDisabled || !hasAudio}
          className={cn(
            sideBtnBase, 
            isPlaying ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" : "hover:bg-indigo-50 hover:text-indigo-600"
          )}
        >
          <Volume2 size={18} strokeWidth={2.5} className={cn(isPlaying && "text-white")} />
        </button>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 3. 下段：アクション・レイヤー（再生速度 ＋ マイク録音） */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm px-2 mt-1 h-14">
        
        {/* 左側：単語帳仕様の「Rate切り替え ＋ Listen」ハイブリッドユニット */}
        <div className={cn("h-full bg-slate-50 border-slate-200", unitBase)}>
          {/* 再生速度セクション */}
          <button
            onClick={onChangePlaybackRate}
            disabled={isInteractionDisabled || isPlaying}
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

          {/* 音声再生セクション（手動再生中、アイコンを単語帳のくるくるへ変更） */}
          <button
            onClick={onPlayAudio}
            disabled={isInteractionDisabled || !hasAudio}
            className={cn(
              "flex-1 h-full flex items-center justify-center gap-2 transition-all",
              isPlaying ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:text-indigo-600"
            )}
          >
            {isPlaying ? (
              <RotateCw size={20} strokeWidth={2.5} className="animate-spin" />
            ) : (
              <Volume2 size={20} strokeWidth={2.5} />
            )}
            <span className="text-[10px] font-black uppercase tracking-widest">
              {isPlaying ? 'Playing' : 'Listen'}
            </span>
          </button>
        </div>

        {/* 右側：音声認識・練習ボタン (WordControlsから完全移植・100%同一挙動) */}
        <button
          onClick={isRecording ? onStopRecord : onStartRecord}
          disabled={(isInteractionDisabled && !isRecording) || isPlaying}
          className={cn(
            "h-full rounded-2xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all overflow-hidden relative",
            isRecording ? "bg-rose-500 text-white shadow-md active:scale-95" : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.97]",
            ((isInteractionDisabled && !isRecording) || isPlaying) && "opacity-20 disabled:pointer-events-none"
          )}
        >
          {isRecording && <span className="absolute inset-0 bg-white/20 animate-pulse" />}
          
          <AnimatePresence mode="wait">
            {isRecording ? (
              <motion.div key="stop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 relative z-10">
                <Square size={14} fill="currentColor" strokeWidth={0} />
                <span className="tracking-[0.1em]">Stop</span>
              </motion.div>
            ) : (
              <motion.div key="mic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 relative z-10">
                <Mic size={20} strokeWidth={2.5} />
                <span className="tracking-[0.1em]">Practice</span>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

    </div>
  );
};