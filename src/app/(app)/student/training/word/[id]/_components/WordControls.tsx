'use client';

import React, { useMemo } from 'react';
import { Bookmark, ArrowRight, ArrowLeft, RotateCw, Volume2, Mic, Check, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWordDrillStore } from '@/stores/useWordDrillStore';
import { cn } from "@/lib/utils";

interface WordControlsProps {
  isListening: boolean;
  timeLeft: number;
  onNext: () => void;
  onPrev: () => void;
  onSaveResume: () => void;
  onToggleAutoPlay: () => void;
  onSpeak: () => void;
  onVoiceCheck: () => void;
}

export const WordControls: React.FC<WordControlsProps> = ({
  isListening,
  timeLeft,
  onNext,
  onPrev,
  onSaveResume,
  onToggleAutoPlay,
  onSpeak,
  onVoiceCheck,
}) => {
  const { isAutoPlaying, words, wordIdx, phraseIdx } = useWordDrillStore();

  // --- Logic / derived states ---
  const currentWord = words[wordIdx];
  const isLastStep = useMemo(() => 
    wordIdx === words.length - 1 && 
    phraseIdx === (currentWord?.phrases.length || 0) - 1
  , [wordIdx, words.length, phraseIdx, currentWord]);

  const isFirstStep = wordIdx === 0 && phraseIdx === 0;
  const isInteractionDisabled = isListening || isAutoPlaying;

  // --- Common Styles (Maintenance Friendly) ---
  const sideBtnBase = "w-11 h-11 shrink-0 flex items-center justify-center rounded-2xl transition-all active:scale-90 disabled:opacity-20 disabled:pointer-events-none";
  const subBtnBase = "h-14 rounded-2xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all overflow-hidden relative";

  return (
    <div className="shrink-0 w-full max-w-md mx-auto flex flex-col items-center select-none pt-2 gap-y-4 px-4 pb-2">
      
      {/* 1. Status Indicator (Fixed Height) */}
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

      {/* 2. Main Navigation Layer */}
      <div className="flex items-center justify-between w-full gap-2">
        {/* Save/Exit */}
        <button
          onClick={onSaveResume}
          disabled={isAutoPlaying}
          className={cn(sideBtnBase, "bg-slate-50 text-slate-400 border border-slate-100 hover:bg-indigo-50 hover:text-indigo-600")}
        >
          <Bookmark size={18} strokeWidth={2.5} />
        </button>

        {/* Pill-shaped Navigation Unit */}
        <div className="flex-1 flex items-center bg-slate-100/50 p-1 rounded-[28px] border border-slate-100">
          {/* Back Button */}
          <button
            onClick={onPrev}
            disabled={isInteractionDisabled || isFirstStep}
            className={cn(
              "w-12 h-12 shrink-0 flex items-center justify-center rounded-[22px] transition-all",
              "bg-white text-slate-400 shadow-sm hover:text-indigo-600 active:scale-90",
              "disabled:opacity-20 disabled:shadow-none disabled:pointer-events-none"
            )}
          >
            <ArrowLeft size={20} strokeWidth={3} />
          </button>

          {/* Vertical Separator */}
          <div className="w-[1px] h-6 bg-slate-200 mx-1" />

          {/* Next/Finish Button */}
          <button
            onClick={onNext}
            disabled={isInteractionDisabled}
            className={cn(
              "flex-1 h-12 rounded-[22px] font-black flex items-center justify-center gap-2.5 transition-all text-xs uppercase tracking-widest active:scale-[0.97]",
              isLastStep ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100" : "bg-indigo-600 text-white shadow-lg shadow-indigo-100",
              "disabled:opacity-40 disabled:shadow-none disabled:pointer-events-none"
            )}
          >
            <span className="tabular-nums">{isLastStep ? 'Finish' : 'Next'}</span>
            <motion.div
              animate={{ x: isInteractionDisabled ? 0 : [0, 5, 0] }}
              transition={{ repeat: isLastStep ? Infinity : 0, duration: 1, delay: 0.5 }}
            >
              {isLastStep ? <Check size={18} strokeWidth={3} /> : <ArrowRight size={18} strokeWidth={3} />}
            </motion.div>
          </button>
        </div>

        {/* Auto Play Toggle */}
        <button
          onClick={onToggleAutoPlay}
          className={cn(
            sideBtnBase,
            "border",
            isAutoPlaying 
              ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" 
              : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-indigo-50 hover:text-indigo-600"
          )}
        >
          <RotateCw size={18} strokeWidth={2.5} className={isAutoPlaying ? 'animate-spin-slow' : ''} />
        </button>
      </div>

      {/* 3. Sub Action Row (Listen & Practice) */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm px-2 mt-1">
        {/* Listen Button */}
        <button
          onClick={onSpeak}
          disabled={isInteractionDisabled}
          className={cn(subBtnBase, "bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100 active:scale-95 disabled:opacity-30 disabled:pointer-events-none")}
        >
          <Volume2 size={22} strokeWidth={2.5} />
          <span className="hidden xs:block">Listen</span>
        </button>

        {/* Practice/Stop Button */}
        <button
          onClick={onVoiceCheck}
          disabled={isAutoPlaying}
          className={cn(
            subBtnBase,
            isListening ? "bg-rose-500 text-white shadow-md active:scale-95" : "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.97]",
            isAutoPlaying && "opacity-20 disabled:pointer-events-none"
          )}
        >
          {isListening && <span className="absolute inset-0 bg-white/20 animate-pulse" />}
          
          <AnimatePresence mode="wait">
            {isListening ? (
              <motion.div key="stop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 relative z-10">
                <Square size={16} fill="currentColor" strokeWidth={0} />
                <span className="tracking-[0.15em]">Stop</span>
              </motion.div>
            ) : (
              <motion.div key="mic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 relative z-10">
                <Mic size={22} strokeWidth={2.5} />
                <span className="hidden xs:block">Practice</span>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
};