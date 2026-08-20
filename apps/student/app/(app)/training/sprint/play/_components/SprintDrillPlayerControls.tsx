'use client';

import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, RotateCw, Volume2, Mic, Check, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";

// 🔌 Zustand ストアのインポート
import { useSprintStore } from '@/stores/useSprintStore';

interface SprintDrillPlayerControlsProps {
  onNext: () => void;
  onPrev: () => void;
  onPlayAudio: () => void; // 💡 Listen 押下（プレイヤー側で制御）
  onStartRecord: () => void;
  onStopRecord: () => void;
  onToggleAutoPlay?: () => void;
  playbackRate: number;
  // 🛠️ 修正点：引数で選択された rate（数値）を取るシグネチャに統一
  onChangePlaybackRate: (rate: number) => void;
  timeLeft: number;
  isStarted?: boolean;
}

/**
 * スプリントドリル用のメイン操作パネル（ポップオーバー・ダイレクト選択版）
 */
export const SprintDrillPlayerControls: React.FC<SprintDrillPlayerControlsProps> = ({
  onNext,
  onPrev,
  onPlayAudio,
  onStartRecord,
  onStopRecord,
  onToggleAutoPlay,
  playbackRate,
  onChangePlaybackRate,
  timeLeft,
  isStarted = true
}) => {
  // 🔌 Zustand ストアから状態を直接マッピング
  const currentIndex = useSprintStore((state) => state.session.currentIndex);
  const totalQuestions = useSprintStore((state) => state.session.questions.length);
  const isRecording = useSprintStore((state) => state.session.isRecording);
  const isAutoPlaying = useSprintStore((state) => state.drill.isAutoPlaying);
  const isPlayingQuestionSequence = useSprintStore((state) => state.drill.isPlayingQuestionSequence);
  const isPlayingAnswerSequence = useSprintStore((state) => state.drill.isPlayingAnswerSequence);
  const isAssessmentMode = useSprintStore((state) => state.config.isAssessmentMode) !== false; // 🚀 追加：発話評価ON/OFFフラグの取得

  // 📝 速度ポップオーバーの開閉ステート
  const [isRateMenuOpen, setIsRateMenuOpen] = useState(false);

  // 🤖 内部合成フラグ
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === totalQuestions - 1;
  const isPlaying = isPlayingQuestionSequence || isPlayingAnswerSequence;

  const isInteractionDisabled = !isStarted || isRecording || isAutoPlaying || isPlaying;
  const isManualPlaying = isPlaying && !isAutoPlaying;

  // --- 共通スタイル定義 ---
  const sideBtnBase = "w-11 h-11 shrink-0 flex items-center justify-center rounded-2xl transition-all active:scale-90 disabled:opacity-20 disabled:pointer-events-none border border-slate-100 bg-slate-50 text-slate-400";
  const unitBase = "flex items-center rounded-2xl border shadow-sm transition-all";
  const splitLeftBase = "w-14 h-full flex flex-col items-center justify-center transition-all shrink-0 border-r relative rounded-l-2xl";

  // 選択可能な速度リスト（見やすい順）
  const AVAILABLE_RATES = [0.8, 1.0, 1.2, 1.5];

  return (
    <div className="shrink-0 w-full max-w-md mx-auto flex flex-col items-center select-none pt-2 gap-y-4 px-4 pb-2 relative">

      {/* 外側タップでポップオーバーを閉じるためのバックドロップ */}
      {isRateMenuOpen && (
        <div 
          className="fixed inset-0 z-30 cursor-default" 
          onClick={() => setIsRateMenuOpen(false)} 
        />
      )}

      {/* 1. 上段：ナビゲーション・レイヤー（戻る・進む） */}
      <div className="flex items-center justify-between w-full gap-2 h-14 z-10">        
        <div className={cn("flex-1 h-full bg-white border-indigo-100 overflow-hidden", unitBase)}>
          <button 
            onClick={onPrev} 
            disabled={isInteractionDisabled || isFirstStep} 
            className={cn("w-14 h-full flex flex-col items-center justify-center transition-all shrink-0 border-r text-slate-400 hover:bg-slate-50 border-indigo-50 disabled:opacity-20")}
          >
            <ArrowLeft size={18} strokeWidth={3} />
          </button>
          
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

        <button
          onClick={onToggleAutoPlay}
          disabled={!isStarted || isManualPlaying}
          className={cn(
            sideBtnBase, 
            isAutoPlaying ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" : "hover:bg-indigo-50 hover:text-indigo-600"
          )}
        >
          <RotateCw size={18} strokeWidth={2.5} className={cn(isAutoPlaying ? "text-white animate-spin-slow" : "text-slate-400")} />
        </button>
      </div>

      {/* 2. 下段：アクション・レイヤー（再生速度 ＋ マイク録音） */}
      <div className={cn(
        "grid grid-cols-2 gap-3 w-full max-w-sm px-2 mt-1 h-14 transition-all",
        isRateMenuOpen ? "z-40 relative" : "z-20 relative"
      )}>
        
        <div className={cn("h-full bg-slate-50 border-slate-200 overflow-visible", unitBase)}>
          
          {/* ⏱️ 再生速度セクション */}
          <div className="h-full relative shrink-0 overflow-visible">
            <button
              onClick={() => !isInteractionDisabled && setIsRateMenuOpen(!isRateMenuOpen)}
              disabled={isInteractionDisabled}
              className={cn(
                splitLeftBase,
                "border-r border-slate-200 hover:bg-slate-100 active:bg-slate-200 cursor-pointer h-full z-10",
                playbackRate !== 1.0 
                  ? "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700 active:bg-indigo-800" 
                  : "text-slate-600"
              )}
            >
              <span className="text-[11px] font-black leading-none">{playbackRate.toFixed(1)}</span>
              <span className={cn(
                "text-[9px] font-black uppercase tracking-tight mt-0.5",
                playbackRate !== 1.0 ? "text-indigo-100" : "text-slate-400"
              )}>Rate</span>
            </button>

            {/* ✨ Framer Motion ツールチップメニュー */}
            <AnimatePresence>
              {isRateMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: -10, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 bg-white border border-slate-200/90 shadow-2xl rounded-2xl p-1.5 min-w-[80px] flex flex-col gap-1 z-50 mb-1"
                >
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2.5 h-2.5 bg-white border-b border-r border-slate-200 rotate-45" />

                  {AVAILABLE_RATES.map((rate) => {
                    const isSelected = playbackRate === rate;
                    return (
                      <button
                        key={rate}
                        onClick={() => {
                          // 🛠️ 修正点：親の関数に選択したレートの数値をそのまま伝える
                          onChangePlaybackRate(rate);
                          setIsRateMenuOpen(false);
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

          <button
            onClick={onPlayAudio}
            disabled={isInteractionDisabled}
            className={cn("flex-1 h-full flex items-center justify-center transition-all cursor-pointer rounded-r-2xl",
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

        {/* 🚀 改修：発話評価OFFモード（isAssessmentMode === false）の場合、マイクボタンを恒久的に disabled（非活性）化 */}
        <button
          onClick={isRecording ? onStopRecord : onStartRecord}
          disabled={(isInteractionDisabled && !isRecording) || isManualPlaying || !isAssessmentMode}
          className={cn("h-full rounded-2xl flex items-center justify-center font-black text-[10px] uppercase tracking-widest transition-all overflow-hidden relative cursor-pointer",
            isRecording ? "bg-rose-500 text-white shadow-md active:scale-95" : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.97]",
            ((isInteractionDisabled && !isRecording) || isManualPlaying || !isAssessmentMode) && "opacity-20 disabled:pointer-events-none disabled:cursor-not-allowed"
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