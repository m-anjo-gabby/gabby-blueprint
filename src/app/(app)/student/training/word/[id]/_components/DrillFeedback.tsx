'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AnalysisResult, FeedbackConfig } from '@/types/wordDrill';

interface DrillFeedbackProps {
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;
  onClose: () => void;
}

export const DrillFeedback: React.FC<DrillFeedbackProps> = ({ 
  feedback, 
  analysis, 
  onClose 
}) => {
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number>(-1);

  if (!feedback || !analysis || !analysis.matches) return null;

  const handleClose = () => {
    setActiveTooltipIndex(-1);
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div 
        className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        <motion.div 
          className="relative bg-white w-full max-w-sm rounded-4xl p-6 shadow-2xl flex flex-col items-center gap-6"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            if (activeTooltipIndex !== -1) setActiveTooltipIndex(-1);
          }}
        >
          {/* 1. Header Area */}
          <div className="w-full flex justify-between items-center pb-1 mb-1">
            <h2 className="flex items-center gap-2 text-[12px] font-black text-slate-700 uppercase tracking-[0.2em]">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: feedback.fill }} />
              発話結果
            </h2>
            <button onClick={handleClose} className="p-1 text-slate-300 hover:text-slate-500 transition-colors">
              <X size={18} />
            </button>
          </div>
          
          {/* 2. Score & Summary Area */}
          <div className="flex items-start gap-4 w-full">
            <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90">
                <circle cx="56" cy="56" r="50" className="stroke-slate-100" strokeWidth="8" fill="none" />
                <motion.circle 
                  cx="56" cy="56" r="50" 
                  style={{ 
                    stroke: feedback.fill, 
                    strokeDasharray: 314, 
                  }}
                  strokeWidth="8" fill="none" strokeLinecap="round" 
                  initial={{ strokeDashoffset: 314 }}
                  animate={{ strokeDashoffset: 314 - (314 * analysis.score) }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-[10px] font-black" style={{ color: feedback.fill }}>{feedback.tagText}</span>
                <span className="text-2xl font-black tabular-nums" style={{ color: feedback.fill }}>
                  {Math.round(analysis.score * 100)}
                </span>
              </div>
            </div>

            {/* 垂直点線区切り */}
            <div className="h-24 w-px border-l border-dashed border-slate-300 mt-1" />

            <div className="flex-1 flex flex-col gap-1 mt-1">
              <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                フィードバック
              </span>
              <p className="text-xs font-bold text-slate-700 leading-snug">
                {analysis.summary}
              </p>
            </div>
          </div>

          {/* 3. Word-by-word Breakdown */}
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-4 mt-1">
            {analysis.matches.map((m, idx) => {
              const isMissing = !m.isMatch;
              const isTargetForTooltip = (m.isMatch && (m.isFuzzy || m.isCombined)) || isMissing;
              const isVisible = activeTooltipIndex === idx;

              // スタイルの決定
              let textColor = 'text-slate-800';
              let decoration = '';

              if (isMissing) {
                textColor = 'text-slate-300';
                decoration = 'border-b-2 border-dashed border-slate-300';
              } else if (m.isFuzzy) {
                textColor = 'text-orange-500';
                decoration = 'underline decoration-wavy decoration-orange-300 underline-offset-8';
              } else if (m.isCombined) {
                textColor = 'text-blue-500';
                decoration = 'underline decoration-dotted decoration-blue-300 underline-offset-8';
              }

              return (
                <div 
                  key={idx} 
                  className={`relative flex flex-col items-center select-none ${isTargetForTooltip ? 'cursor-pointer' : 'cursor-default'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isTargetForTooltip) setActiveTooltipIndex(isVisible ? -1 : idx);
                  }}
                  onMouseEnter={() => {
                    if (window.matchMedia('(hover: hover)').matches && isTargetForTooltip) {
                      setActiveTooltipIndex(idx);
                    }
                  }}
                  onMouseLeave={() => {
                    if (window.matchMedia('(hover: hover)').matches) {
                      setActiveTooltipIndex(-1);
                    }
                  }}
                >
                  {/* 対比ツールチップ */}
                  {isVisible && isTargetForTooltip && (
                    <div className="absolute -top-12 whitespace-nowrap px-3 py-2 bg-slate-900 text-white rounded-2xl shadow-xl z-30 animate-in zoom-in-50 duration-200">
                      <div className="flex items-center gap-2 text-[11px] font-bold">
                        {isMissing ? (
                          <span className="text-slate-200">聞き取れませんでした</span>
                        ) : (
                          <>
                            <span className="text-slate-400">{m.heard}</span>
                            <span className="text-slate-600">→</span>
                            <span className="text-sky-400">{m.word}</span>
                          </>
                        )}
                      </div>
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
                    </div>
                  )}

                  <span className={`text-2xl font-bold transition-all ${textColor} ${decoration}`}>
                    {m.word}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 4. Improvement Advice */}
          {analysis.issues && analysis.issues.length > 0 && (
            <div className="w-full bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-2">改善のヒント</p>
              <ul className="space-y-1.5">
                {analysis.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-slate-600 leading-tight">
                    <span className="text-slate-400 mt-0.5">•</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};