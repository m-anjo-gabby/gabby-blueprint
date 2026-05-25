'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";
import { SprintQuestion } from "@gabby/types/sprint";
import { HelpCircle, MessageSquare, CheckCircle2 } from 'lucide-react';

interface QuestionCardProps {
  question: SprintQuestion;
  mode: 'drill' | 'sprint';
  isRevealed: boolean;
  // ➕ グループ内の進捗を可視化するためのプロパティを追加
  groupCurrentIndex?: number; // 例: 0, 1, 2...
  groupTotalCount?: number;   // 例: 3 (グループ内の総問題数)
}

/**
 * スプリントドリル・問題カード（単語帳ハイブリッド進化版）
 * 二重枠を撤廃し、領域全体をダイナミックに使用。グループ進捗インジケーターを完全移植。
 */
export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  mode,
  isRevealed,
  groupCurrentIndex = 0,
  groupTotalCount = 3 // デフォルト値（実際はAPIや親のデータから注入）
}) => {
  // データ不在時のフォールバック
  if (!question) return <div className="flex-1 w-full animate-pulse bg-slate-50/50 rounded-[40px]" />;

  return (
    // 🎨 【改善】bg-white や shadow、border-slate-100 を撤廃し、親の白い領域と完全融合！
    <div className="flex-1 min-h-[380px] flex flex-col w-full overflow-hidden relative">
      
      {/* ──────────────────────────────────────────────────────────── */}
      {/* 1. Step Badge & 分割プログレス (単語帳のアイデンティティを完全継承) */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="w-full shrink-0 flex flex-col items-start mb-4"> 
        <div className="flex items-center h-5 overflow-hidden rounded-md border border-indigo-100 shadow-sm mb-3">
          <div className="bg-indigo-600 px-2 h-full flex items-center border-r border-white/20">
            <span className="text-[9px] font-black text-white uppercase tracking-wider">
              Question {groupCurrentIndex + 1}
            </span>
          </div>
          
          <div className="bg-indigo-50/50 px-2 h-full flex items-center">
            <span className="text-[9px] font-black text-indigo-600/80 uppercase tracking-tight">
              {mode === 'drill' ? 'Drill Set' : 'Sprint'}
            </span>
          </div>
        </div>

        {/* 📊 分割ステッププログレスバー: 単語帳と100%同一のグリッドロジック */}
        <div 
          className="grid gap-1 w-32" 
          style={{ gridTemplateColumns: `repeat(${groupTotalCount}, 1fr)` }}
        >
          {Array.from({ length: groupTotalCount }).map((_, i) => (
            <div key={i} className="h-[3px] bg-slate-100 rounded-full overflow-hidden relative">
              <motion.div
                initial={false}
                animate={{ x: i <= groupCurrentIndex ? "0%" : "-100%" }}
                transition={{ duration: 0.4, ease: "circOut" }}
                className="absolute inset-0 bg-indigo-500 shadow-[0_0_4px_rgba(99,102,241,0.2)]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 2. メインコンテンツエリア（広くなった領域を贅沢に活用） */}
      {/* ──────────────────────────────────────────────────────────── */}
      {/* 🚀 【改善】px-0 にしてカードの端までフルにテキスト領域を拡大 */}
      <div className="flex-1 flex flex-col justify-center gap-y-6 w-full select-none px-0">
        
        {/* 【A】状況文（Context） */}
        <div className="space-y-1 text-center bg-slate-50/80 p-3.5 rounded-3xl border border-slate-100/70">
          <div className="flex items-center justify-center gap-1 text-slate-400">
            <MessageSquare size={11} />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Situation Context</span>
          </div>
          <p className="text-sm font-bold text-slate-600 leading-relaxed tracking-tight">
            {question.statement}
          </p>
        </div>

        {/* 【B】問題文（Question）: 二重枠が消えたことで、より大迫力に */}
        <div className="space-y-2 text-center py-4">
          <div className="flex items-center justify-center gap-1 text-indigo-500">
            <HelpCircle size={14} strokeWidth={2.5} />
            <span className="text-[9px] font-black uppercase tracking-widest">Question</span>
          </div>
          {/* 🚀 text-3xl から最大 sm:text-4xl へサイズアップ！視認性が格段に向上 */}
          <p className="text-3xl sm:text-4xl font-black text-slate-800 leading-[1.15] tracking-tighter antialiased">
            {question.question}
          </p>
        </div>

        {/* ──────────────────────────────────────────────────────────── */}
        {/* 3. 解答エリア（Reveal展開） */}
        {/* ──────────────────────────────────────────────────────────── */}
        <div className="min-h-[100px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {isRevealed ? (
              <motion.div
                key="answer-box"
                initial={{ opacity: 0, scale: 0.98, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="w-full text-center bg-indigo-50/60 border border-indigo-100/80 rounded-[32px] p-5 space-y-1.5 shadow-sm"
              >
                <div className="flex items-center justify-center gap-1 text-emerald-600">
                  <CheckCircle2 size={13} strokeWidth={2.5} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Model Answer</span>
                </div>
                <p className="text-2xl sm:text-3xl font-black text-indigo-600 leading-[1.15] tracking-tighter antialiased">
                  {question.answer_sentence_yes}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="placeholder-box"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full h-full min-h-[80px] flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-[32px] p-4 text-slate-300 bg-slate-50/30"
              >
                <span className="text-[9px] font-black uppercase tracking-[0.2.5em] text-slate-400 animate-pulse">
                  Tap Reveal to see answer
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
};