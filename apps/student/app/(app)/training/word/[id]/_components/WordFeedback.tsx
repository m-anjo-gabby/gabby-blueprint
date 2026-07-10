'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { X, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AnalysisResult, FeedbackConfig } from '@gabby/types/speechAssessment';
import { cn } from "@/lib/utils";

interface WordFeedbackProps {
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;
  onClose: () => void;
}

export const WordFeedback: React.FC<WordFeedbackProps> = ({ 
  feedback, 
  analysis, 
  onClose 
}) => {
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number>(-1);

  // --- Logic Helpers ---
  const getWordStyle = useCallback((match: any) => {
    if (!match.isMatch) return { 
      text: 'text-slate-300', 
      deco: 'border-b-2 border-dashed border-slate-300',
      tooltipType: 'missing' 
    };
    if (match.isFuzzy) return { 
      text: 'text-orange-500', 
      deco: 'underline decoration-wavy decoration-orange-300 underline-offset-8',
      tooltipType: 'fuzzy'
    };
    if (match.isCombined) return { 
      text: 'text-blue-500', 
      deco: 'underline decoration-dotted decoration-blue-300 underline-offset-8',
      tooltipType: 'combined'
    };
    return { text: 'text-slate-800', deco: '', tooltipType: null };
  }, []);

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
          className="relative bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl flex flex-col items-center gap-6"
          initial={{ scale: 0.95, y: 10, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 10, opacity: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            if (activeTooltipIndex !== -1) setActiveTooltipIndex(-1);
          }}
        >
          {/* 1. Header: 情報密度を下げて洗練 */}
          <div className="w-full flex justify-between items-center px-1">
            <h2 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: feedback.fill }} />
              Analysis Result
            </h2>
            <button onClick={handleClose} className="p-1 text-slate-300 hover:text-slate-500 transition-colors">
              <X size={20} />
            </button>
          </div>
          
          {/* 2. Score Area: サークルゲージを少し小さく、情報を整理 */}
          <div className="flex items-center gap-6 w-full bg-slate-50/50 p-4 rounded-3xl border border-slate-100/50">
            <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="36" className="stroke-slate-100" strokeWidth="6" fill="none" />
                <motion.circle 
                  cx="40" cy="40" r="36" 
                  style={{ stroke: feedback.fill, strokeDasharray: 226 }}
                  strokeWidth="6" fill="none" strokeLinecap="round" 
                  initial={{ strokeDashoffset: 226 }}
                  animate={{ strokeDashoffset: 226 - (226 * analysis.score) }}
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[18px] font-black tabular-nums leading-none" style={{ color: feedback.fill }}>
                  {Math.round(analysis.score * 100)}
                </span>
                <span className="text-[8px] font-bold opacity-60" style={{ color: feedback.fill }}>SCORE</span>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-1.5">
              <div className="inline-flex px-2 py-0.5 rounded-full w-fit bg-white border text-[9px] font-black uppercase tracking-wider" style={{ color: feedback.fill, borderColor: `${feedback.fill}20` }}>
                {feedback.tagText}
              </div>
              <p className="text-[13px] font-bold text-slate-700 leading-tight">
                {analysis.summary}
              </p>
            </div>
          </div>

          {/* 3. Breakdown Area: 単語ごとの解析結果 */}
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-5 px-2">
            {analysis.matches.map((m, idx) => {
              const { text, deco, tooltipType } = getWordStyle(m);
              const isTarget = !!tooltipType;
              const isVisible = activeTooltipIndex === idx;

              return (
                <div 
                  key={idx} 
                  className={cn("relative flex flex-col items-center", isTarget ? "cursor-pointer" : "cursor-default")}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isTarget) setActiveTooltipIndex(isVisible ? -1 : idx);
                  }}
                >
                  <AnimatePresence>
                    {isVisible && isTarget && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 5, scale: 0.9 }}
                        className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 bg-slate-900 text-white rounded-xl shadow-xl z-30"
                      >
                        <div className="flex items-center gap-2 text-[10px] font-bold">
                          {m.isMatch ? (
                            <><span className="text-slate-400 line-through decoration-slate-500">{m.heard}</span>
                            <span className="text-sky-400">{m.word}</span></>
                          ) : (
                            <span>聞き取れませんでした</span>
                          )}
                        </div>
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <span className={cn(
                    "text-xl sm:text-2xl font-black transition-all duration-300",
                    text, deco
                  )}>
                    {m.word}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 4. Advice Area: 改善のヒント */}
          {analysis.issues && analysis.issues.length > 0 && (
            <div className="w-full bg-indigo-50/50 p-4 rounded-[24px] border border-indigo-100/50">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={14} className="text-indigo-500" />
                <p className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">Tips for Improvement</p>
              </div>
              <ul className="space-y-2">
                {analysis.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] font-medium text-slate-600 leading-relaxed">
                    <div className="w-1 h-1 rounded-full bg-indigo-300 mt-1.5 shrink-0" />
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