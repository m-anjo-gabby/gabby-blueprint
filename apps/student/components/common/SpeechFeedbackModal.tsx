'use client';

import React, { useState } from 'react';
import { X, Lightbulb, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AnalysisResult, FeedbackConfig } from '@gabby/types/speechAssessment';
import { getWordMatchStyle } from '@gabby/lib/assessment/wordMatchStyle';
import { cn } from "@/lib/utils";

export interface SpeechFeedbackModalProps {
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;
  onClose: () => void;
  /** ヘッダーに表示するタイトル文言 */
  title: string;
  /** 改善アドバイス欄の見出し文言 */
  adviceTitle: string;
  /** 単語タップで聞き取り結果のツールチップを表示するか（Wordドリルのみtrue） */
  interactive?: boolean;
  /** 呼び出し元画面ごとの既存デザイン（z-index・背景ぼかし・角丸等）を再現するプリセット */
  variant?: 'word' | 'sprint';
}

const VARIANT_STYLES = {
  word: {
    overlay: "z-[100] bg-slate-900/60 backdrop-blur-sm",
    panel: "rounded-[32px]",
    panelMotion: {
      initial: { scale: 0.95, y: 10, opacity: 0 },
      animate: { scale: 1, y: 0, opacity: 1 },
      exit: { scale: 0.95, y: 10, opacity: 0 },
    },
    closeBtn: "p-1",
    closeIconStroke: 2,
    scoreBox: "p-4 rounded-3xl bg-slate-50/50 border border-slate-100/50",
    tag: "px-2 py-0.5",
    matchesWrap: "gap-x-3 gap-y-5",
    matchText: "text-xl sm:text-2xl",
  },
  sprint: {
    overlay: "z-[110] bg-slate-950/40 backdrop-blur-md",
    panel: "rounded-[36px] border border-white/50",
    panelMotion: {
      initial: { scale: 0.9, y: 20, opacity: 0 },
      animate: { scale: 1, y: 0, opacity: 1 },
      exit: { scale: 0.9, y: 20, opacity: 0 },
    },
    closeBtn: "p-2 -mr-2",
    closeIconStroke: 2.5,
    scoreBox: "p-5 rounded-[28px] bg-slate-50 border border-slate-100/50",
    tag: "px-2.5 py-0.5",
    matchesWrap: "gap-x-3 gap-y-4 max-h-[160px] overflow-y-auto w-full py-1",
    matchText: "text-lg",
  },
} as const;

/**
 * 発話評価結果のフィードバックモーダル。WordFeedback / SprintFeedback で共通利用。
 * スコアゲージ・単語ブレイクダウン・改善アドバイスの構成は共通で、
 * 呼び出し元ごとの見た目の差分（z-index・角丸・ツールチップ有無等）は variant / interactive で吸収する。
 * ヘッダーは常時固定し、本文のみスクロールさせることで、長いフレーズでもモーダルが画面からはみ出さないようにする。
 */
export const SpeechFeedbackModal: React.FC<SpeechFeedbackModalProps> = ({
  feedback,
  analysis,
  onClose,
  title,
  adviceTitle,
  interactive = false,
  variant = 'word',
}) => {
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number>(-1);
  const [showHeard, setShowHeard] = useState(false);
  const s = VARIANT_STYLES[variant];

  if (!feedback || !analysis || !analysis.matches) return null;

  const handleClose = () => {
    setActiveTooltipIndex(-1);
    setShowHeard(false);
    onClose();
  };

  // 採点に実際使われた語（matches[].heard）を正解語の順に並べて再構成した文字列。
  // 音声認識の生の累積テキストは、言い直し（false start）をした際に直前の発話が
  // 混ざったまま残るため使わない。判定ロジックが確定させた結果だけを表示することで、
  // スコアの根拠と表示内容を一致させる。
  const reconstructedHeard = analysis.matches
    .map(m => (m.isMatch && m.heard ? m.heard : '―'))
    .join(' ');

  return (
    <AnimatePresence>
      <motion.div
        className={cn("absolute inset-0 flex items-center justify-center p-4", s.overlay)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        <motion.div
          className={cn("relative bg-white w-full max-w-sm max-h-[85vh] shadow-2xl flex flex-col overflow-hidden", s.panel)}
          {...s.panelMotion}
          onClick={(e) => {
            e.stopPropagation();
            if (activeTooltipIndex !== -1) setActiveTooltipIndex(-1);
          }}
        >
          {/* 1. Header（スクロールしても常に表示） */}
          <div className="w-full flex justify-between items-center px-6 pt-6 pb-2 shrink-0">
            <h2 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: feedback.fill }} />
              {title}
            </h2>
            <button onClick={handleClose} className={cn("text-slate-300 hover:text-slate-500 transition-colors", s.closeBtn)}>
              <X size={20} strokeWidth={s.closeIconStroke} />
            </button>
          </div>

          {/* スクロール領域: スコア以下のコンテンツが多い場合はここだけがスクロールする */}
          <div className="w-full flex flex-col items-center gap-6 px-6 pb-6 overflow-y-auto overscroll-contain">
            {/* 2. Score Area */}
            <div className={cn("flex items-center gap-6 w-full", s.scoreBox)}>
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
                <div className={cn("inline-flex rounded-full w-fit bg-white border text-[9px] font-black uppercase tracking-wider", s.tag)} style={{ color: feedback.fill, borderColor: `${feedback.fill}20` }}>
                  {feedback.tagText}
                </div>
                <p className="text-[13px] font-bold text-slate-700 leading-tight">
                  {analysis.summary}
                </p>
              </div>
            </div>

            {/* 3. Breakdown Area: 単語ごとの解析結果 */}
            <div className={cn("flex flex-wrap justify-center px-2", s.matchesWrap)}>
              {analysis.matches.map((m, idx) => {
                const { text, deco, tooltipType } = getWordMatchStyle(m);
                const isTarget = interactive && !!tooltipType;
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
                    {interactive && (
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
                    )}

                    <span className={cn("font-black transition-all duration-300", s.matchText, text, deco)}>
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
                  <p className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">{adviceTitle}</p>
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

            {/* 5. Heard Toggle: 採点に使われた語をタップで表示する補助情報（常時表示せず、スコア・アドバイスより下に配置） */}
            <div className="w-full flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHeard(v => !v);
                }}
                className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showHeard ? '聞き取った内容を隠す' : '聞き取った内容を見る'}
                <ChevronDown size={12} className={cn("transition-transform", showHeard && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {showHeard && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="w-full overflow-hidden"
                  >
                    <p className="text-[11px] leading-relaxed text-slate-500 bg-slate-50 rounded-2xl px-4 py-3">
                      &quot;{reconstructedHeard}&quot;
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
