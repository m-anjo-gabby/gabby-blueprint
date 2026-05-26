'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SprintQuestion, SprintQuestionType } from "@gabby/types/sprint";
import { HelpCircle, MessageSquare, CheckCircle2, Volume2 } from 'lucide-react';

interface QuestionCardProps {
  question: SprintQuestion;
  mode: 'drill' | 'sprint';
  isRevealed: boolean;
  onReveal: () => void;
  groupCurrentIndex?: number;
  groupTotalCount?: number;
  onPlayAudio?: (voiceUrl: string | null, text: string) => void;
}

/**
 * スプリント種別ごとの表示文言定義インターフェース
 */
interface QuestionConfig {
  sectionTitle: string;
  instruction: string;
}

/**
 * 🛠️ 堅牢化: question_type に応じた文言マッピングを純粋関数として分離
 * 今後種別が増えた場合も、このオブジェクトと関数を拡張するだけで安全に対応可能
 */
const getQuestionConfig = (type: SprintQuestionType, isSprintMode: boolean, hasNoAnswer: boolean): QuestionConfig => {
  switch (type) {
    case '0': // Speed
      return {
        sectionTitle: "質問",
        instruction: isSprintMode 
          ? (hasNoAnswer ? "「No＋否定文」で回答" : "「Yes＋肯定文」で回答")
          : "「Yes＋肯定文」または「No＋否定文」で回答"
      };
    case '4': // Structure
      return {
        sectionTitle: "指示",
        instruction: "指示に従って単語を入れ替えて解答"
      };
    case '5': // Builders
      return {
        sectionTitle: "指示",
        instruction: "指示された単語を適切な位置に追加して回答"
      };
    case '6': // Mastery
      return {
        sectionTitle: "質問",
        instruction: "基本文とその内容に対する質問に回答"
      };
    default:
      return {
        sectionTitle: "問題",
        instruction: isSprintMode ? "Sprint Mode" : "Drill Mode"
      };
  }
};

/**
 * スプリントドリル・問題カード（直後密着＆日本語完全ローカライズ版）
 */
export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  mode,
  isRevealed,
  onReveal,
  groupCurrentIndex = 0,
  groupTotalCount = 3,
  onPlayAudio
}) => {
  
  // 🛡️ ガード節: データ不在時の早期堅牢リターン
  if (!question) {
    return <div className="flex-1 w-full animate-pulse bg-slate-50/50 rounded-[40px]" />;
  }

  const isSprintMode = mode === 'sprint';
  const hasNoSentence = !!question.answer_sentence_no;

  // 種別ごとの設定を安全に取得
  const { sectionTitle, instruction } = getQuestionConfig(question.question_type, isSprintMode, hasNoSentence);

  // 音声再生トリガー時のバブルアップ（誤動作）防止ヘルパー
  const triggerAudio = (e: React.MouseEvent, voiceUrl: string | null, text: string) => {
    e.stopPropagation(); // Revealイベント等の発火を完全に遮断
    if (onPlayAudio) {
      onPlayAudio(voiceUrl, text);
    }
  };

  return (
    <div className="w-full flex flex-col items-stretch text-left relative pt-14 sm:pt-16">
      
      {/* ──────────────────────────────────────────────────────────── */}
      {/* 1. Step Badge & 分割プログレスバー */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 w-full shrink-0 flex flex-col items-start px-0.5 select-none"> 
        <div className="flex items-center h-5 overflow-hidden rounded-md border border-indigo-100 shadow-sm mb-2">
          <div className="bg-indigo-600 px-2 h-full flex items-center border-r border-white/20">
            <span className="text-[9px] font-black text-white uppercase tracking-wider">
              Q {groupCurrentIndex + 1}
            </span>
          </div>
          <div className="bg-indigo-50/50 px-2 h-full flex items-center">
            <span className="text-[9px] font-black text-indigo-600/80 tracking-tight">
              {instruction}
            </span>
          </div>
        </div>

        <div className="grid gap-1 w-28 sm:w-32" style={{ gridTemplateColumns: `repeat(${groupTotalCount}, 1fr)` }}>
          {Array.from({ length: groupTotalCount }).map((_, i) => (
            <div key={i} className="h-[2.5px] sm:h-[3px] bg-slate-100 rounded-full overflow-hidden relative">
              <motion.div 
                initial={false} 
                animate={{ x: i <= groupCurrentIndex ? "0%" : "-100%" }} 
                transition={{ duration: 0.35, ease: "circOut" }} 
                className="absolute inset-0 bg-indigo-500" 
              />
            </div>
          ))}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 2. メインコンテンツ（美しい垂直左線アライン） */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-y-4 sm:gap-y-7 w-full select-none mt-1">
        
        {/* 【A】基本文セクション（グレー） */}
        {!isSprintMode && question.statement && (
          <div className="w-full text-left border-l-4 border-slate-200 pl-3 sm:pl-4 py-0.5">
            {/* ✨ 改善: 見出しの直後にスピーカーが心地よく密着するスタイルに固定 */}
            <div className="flex items-center gap-x-1.5 text-slate-400 mb-1 sm:mb-2">
              <MessageSquare size={12} />
              <span className="text-[10px] font-bold tracking-wider leading-none">基本文</span>
              <button 
                onClick={(e) => triggerAudio(e, question.statement_voice, question.statement || "")}
                className="w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:text-indigo-500 hover:bg-slate-100 transition-colors cursor-pointer outline-none active:scale-90"
                title="音声を再生"
              >
                <Volume2 size={13} />
              </button>
            </div>
            <p className="text-sm sm:text-base font-bold text-slate-600 leading-relaxed tracking-tight">
              {question.statement}
            </p>
          </div>
        )}

        {/* 【B】質問 / 指示セクション（インディゴ） */}
        <div className="w-full text-left border-l-4 border-indigo-500 pl-3 sm:pl-4 py-0.5">
          <div className="flex items-center gap-x-1.5 text-indigo-500 mb-1 sm:mb-2">
            <HelpCircle size={13} strokeWidth={2.5} />
            <span className="text-[10px] font-bold tracking-wider leading-none">{sectionTitle}</span>
            <button 
              onClick={(e) => triggerAudio(e, question.question_voice, question.question)}
              className="w-5 h-5 flex items-center justify-center rounded-full text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer outline-none active:scale-90"
              title="音声を再生"
            >
              <Volume2 size={13} strokeWidth={2.5} />
            </button>
          </div>
          <p className="text-2xl sm:text-[34px] font-black text-slate-800 leading-[1.25] tracking-tighter antialiased">
            {question.question}
          </p>
        </div>

        {/* 【C】解答セクション（サクセスエメラルド） */}
        <div className="w-full min-h-[80px] sm:min-h-[96px] flex items-center justify-center mt-0.5">
          <AnimatePresence mode="wait">
            {isRevealed ? (
              <motion.div
                key="answer-box"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="w-full flex flex-col gap-3 sm:gap-5"
              >
                {question.answer_sentence_no ? (
                  /* 💡 Speed専用：YES / NO の2ペイン並び */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 w-full">
                    {/* YESブロック */}
                    <div className="text-left border-l-4 border-emerald-500 bg-emerald-50/20 pl-3 sm:pl-4 pr-2 py-1 sm:py-1.5 rounded-r-xl">
                      <div className="flex items-center gap-x-1.5 text-emerald-600 mb-1">
                        <CheckCircle2 size={12} strokeWidth={2.5} />
                        <span className="text-[9px] font-bold tracking-wider">解答（YES）</span>
                        <button 
                          onClick={(e) => triggerAudio(e, question.answer_sentence_yes_voice, question.answer_sentence_yes)}
                          className="w-5 h-5 flex items-center justify-center rounded-full text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100/50 transition-colors cursor-pointer outline-none active:scale-90"
                        >
                          <Volume2 size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                      <p className="text-lg sm:text-2xl font-black text-emerald-700 leading-[1.25] tracking-tighter antialiased">
                        {question.answer_sentence_yes}
                      </p>
                    </div>

                    {/* NOブロック */}
                    <div className="text-left border-l-4 border-amber-500 bg-amber-50/20 pl-3 sm:pl-4 pr-2 py-1 sm:py-1.5 rounded-r-xl">
                      <div className="flex items-center gap-x-1.5 text-amber-600 mb-1">
                        <CheckCircle2 size={12} strokeWidth={2.5} />
                        <span className="text-[9px] font-bold tracking-wider">解答（NO）</span>
                        <button 
                          onClick={(e) => triggerAudio(e, question.answer_sentence_no_voice, question.answer_sentence_no || "")}
                          className="w-5 h-5 flex items-center justify-center rounded-full text-amber-500 hover:text-amber-700 hover:bg-amber-100/50 transition-colors cursor-pointer outline-none active:scale-90"
                        >
                          <Volume2 size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                      <p className="text-lg sm:text-2xl font-black text-amber-700 leading-[1.25] tracking-tighter antialiased">
                        {question.answer_sentence_no}
                      </p>
                    </div>
                  </div>
                ) : (
                  /* 💡 通常：1択解答ブロック */
                  <div className="w-full text-left border-l-4 border-emerald-500 bg-emerald-50/25 pl-3 sm:pl-4 pr-3 py-1.5 sm:py-2 rounded-r-2xl">
                    <div className="flex items-center gap-x-1.5 text-emerald-600 mb-1 sm:mb-2">
                      <CheckCircle2 size={13} strokeWidth={2.5} />
                      <span className="text-[10px] font-bold tracking-wider">解答</span>
                      <button 
                        onClick={(e) => triggerAudio(e, question.answer_sentence_yes_voice, question.answer_sentence_yes)}
                        className="w-5 h-5 flex items-center justify-center rounded-full text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer outline-none active:scale-90"
                      >
                        <Volume2 size={13} strokeWidth={2.5} />
                      </button>
                    </div>
                    <p className="text-2xl sm:text-[34px] font-black text-emerald-600 leading-[1.2] tracking-tighter antialiased">
                      {question.answer_sentence_yes}
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              /* ✨ 改善: 日本語に完全ローカライズされたスマートな開示用点線ボタン */
              <motion.button
                key="placeholder-box"
                onClick={onReveal}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                whileHover={{ scale: 1.002, backgroundColor: "rgba(241, 245, 249, 0.6)" }}
                whileTap={{ scale: 0.998 }}
                className="w-full h-full min-h-[80px] sm:min-h-[96px] flex flex-col items-center justify-center border border-dashed border-slate-200 hover:border-indigo-300 rounded-[20px] sm:rounded-[24px] px-4 py-3 text-indigo-500/80 bg-slate-50/30 transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping shrink-0" />
                  <span className="text-[11px] sm:text-xs font-black tracking-[0.15em] text-indigo-600/90">
                    タップして解答を表示
                  </span>
                </div>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
};