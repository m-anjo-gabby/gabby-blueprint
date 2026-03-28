'use client';

import React from 'react';
import { Bookmark, ArrowRight, RotateCw, Volume2, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWordDrillStore } from '@/stores/useWordDrillStore';

interface DrillControlsProps {
  isListening: boolean;
  timeLeft: number;
  onNext: () => void;
  onSaveResume: () => void;
  onToggleAutoPlay: () => void; // Page側でダイアログを出すための関数
  onSpeak: () => void;
  onVoiceCheck: () => void;
}

export const DrillControls: React.FC<DrillControlsProps> = ({
  isListening,
  timeLeft,
  onNext,
  onSaveResume,
  onToggleAutoPlay,
  onSpeak,
  onVoiceCheck,
}) => {
  // Store から表示に必要な状態のみを取得
  const isAutoPlaying = useWordDrillStore((state) => state.isAutoPlaying);
  const words = useWordDrillStore((state) => state.words);
  const wordIdx = useWordDrillStore((state) => state.wordIdx);
  const phraseIdx = useWordDrillStore((state) => state.phraseIdx);

  // 最終ステップ判定（Finishボタンへの切り替え用）
  const currentWord = words[wordIdx];
  const isLastStep = 
    wordIdx === words.length - 1 && 
    phraseIdx === (currentWord?.phrases.length || 0) - 1;

  // ボタン無効化の共通条件
  const isInteractionDisabled = isListening || isAutoPlaying;

  return (
    <div className="shrink-0 space-y-3 pt-2 w-full flex flex-col items-center">
      {/* 上段：[栞保存] [メイン操作] [自動再生] */}
      <div className="flex items-center gap-3 w-full max-w-sm px-2">
        {/* 1. 保存ボタン（Page側のhandleSaveAndExitを呼ぶ） */}
        <button
          onClick={onSaveResume}
          disabled={isAutoPlaying}
          className={`shrink-0 w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 border border-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-all active:scale-90 ${
            isAutoPlaying ? 'opacity-30 grayscale pointer-events-none' : ''
          }`}
          title="進捗を保存して終了"
        >
          <Bookmark size={20} strokeWidth={2.5} />
        </button>

        {/* 2. 次へボタン */}
        <button
          onClick={onNext}
          disabled={isInteractionDisabled}
          className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] disabled:opacity-50"
        >
          {isLastStep ? 'Finish Drills' : 'Next Step'}
          <ArrowRight size={16} strokeWidth={3} />
        </button>

        {/* 3. 自動再生ボタン（Page側のダイアログ処理を挟むため onToggleAutoPlay を実行） */}
        <button
          onClick={onToggleAutoPlay}
          className={`shrink-0 w-12 h-12 flex items-center justify-center rounded-2xl border transition-all active:scale-90 ${
            isAutoPlaying
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg'
              : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-indigo-50 hover:text-indigo-600'
          }`}
          title="自動再生の切り替え"
        >
          <RotateCw
            size={20}
            strokeWidth={2.5}
            className={isAutoPlaying ? 'animate-spin-slow' : ''}
          />
        </button>
      </div>

      {/* 下段：[読み上げ] [音声認識/録音] */}
      <div className="flex items-center gap-3 w-full max-w-sm px-2">
        <div className="w-12 shrink-0" />
        <div className="flex-1 grid grid-cols-2 gap-3">
          {/* スピーカーボタン */}
          <button
            onClick={onSpeak}
            disabled={isInteractionDisabled}
            className="py-4 bg-slate-50 text-slate-400 rounded-3xl border border-slate-100 hover:bg-slate-100 hover:text-indigo-600 transition-all flex items-center justify-center disabled:opacity-50"
          >
            <Volume2 size={20} strokeWidth={2.5} />
          </button>

          {/* マイクボタン */}
          <button
            onClick={onVoiceCheck}
            disabled={isAutoPlaying}
            className={`relative py-3 w-full rounded-3xl flex items-center justify-center transition-all overflow-hidden ${
              isAutoPlaying
                ? 'opacity-30 grayscale pointer-events-none'
                : 'active:scale-95'
            } ${
              isListening
                ? 'bg-rose-500 text-white shadow-lg'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={isListening ? 'time' : 'icon'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.1 }}
                className="relative z-10 font-black tabular-nums"
              >
                {isListening ? (
                  `${timeLeft}s`
                ) : (
                  <Mic size={20} strokeWidth={2.5} />
                )}
              </motion.div>
            </AnimatePresence>
          </button>
        </div>
        <div className="w-12 shrink-0" />
      </div>
    </div>
  );
};