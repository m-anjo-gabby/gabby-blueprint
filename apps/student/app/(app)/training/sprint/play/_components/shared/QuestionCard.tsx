'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SprintQuestionType } from "@gabby/types/sprint";
import { HelpCircle, MessageSquare, CheckCircle2, Volume2, Eye, CircleDot, Headphones, ArrowRight, Languages } from 'lucide-react';

// 🔌 Zustand ストアのインポート
import { useSprintStore } from '@/stores/useSprintStore';
import { cn } from '@/lib/utils';

interface QuestionCardProps {
  groupCurrentIndex?: number;
  groupTotalCount?: number;
  onPlayAudio?: (voiceUrl: string | null, text: string) => void;
  audioPhase?: 'idle' | 'statement' | 'question' | 'answer';
}

/**
 * 🛠️ question_type に応じた文言マッピング
 */
const SPRINT_LABELS: Record<SprintQuestionType, { sectionTitle: string; instruction: string; phaseLabel: string }> = {
  '0': { sectionTitle: "質問", instruction: "", phaseLabel: "質問文" },
  '4': { sectionTitle: "指示", instruction: "", phaseLabel: "指示文" },
  '5': { sectionTitle: "指示", instruction: "", phaseLabel: "指示文" },
  '6': { sectionTitle: "質問", instruction: "", phaseLabel: "質問文" },
};

export const QuestionCard: React.FC<QuestionCardProps> = ({
  groupCurrentIndex = 0,
  groupTotalCount = 3,
  onPlayAudio,
  audioPhase = 'idle',
}) => {
  
  // 🔌 Zustand ストアから必要な状態とアクションを抽出
  const question = useSprintStore((state) => state.questions[state.currentIndex]);
  const questions = useSprintStore((state) => state.questions);
  const currentIndex = useSprintStore((state) => state.currentIndex);
  const mode = useSprintStore((state) => state.mode);
  const questionType = useSprintStore((state) => state.questionType);
  const isRevealed = useSprintStore((state) => state.isRevealed);
  const isAutoPlaying = useSprintStore((state) => state.isAutoPlaying);
  const handleReveal = useSprintStore((state) => state.setIsRevealed);

  // 📝 問題文を表示するかどうかのローカルステート（ドリルモード用）
  const [isProblemVisible, setIsProblemVisible] = useState(false);
  const [showJaStatement, setShowJaStatement] = useState(false);
  const [showJaQuestion, setShowJaQuestion] = useState(false);
  const [showJaAnswer, setShowJaAnswer] = useState(false);
  const [prevIndex, setPrevIndex] = useState(currentIndex);

  // 🔄 修正：useEffectを使わずにレンダー中にステートを調整（Cascading Renders 警告の回避）
  if (currentIndex !== prevIndex) {
    setPrevIndex(currentIndex);
    setIsProblemVisible(false);
    setShowJaStatement(false);
    setShowJaQuestion(false);
    setShowJaAnswer(false);
  }

  // 設定マッピングの取得
  const config = SPRINT_LABELS[questionType || '0'] || { sectionTitle: "問題", instruction: "", phaseLabel: "問題文" };
  const isSprintMode = mode === 'sprint';
  const isDrillMode = mode === 'drill';

  // 問題番号のラベル生成 (ヘッダー用配置)
  const questionNumberLabel = useMemo(() => {
    if (!question) return '';
    // Speedモードなら全体の通し番号、それ以外はグループの通し番号を表示
    if (questionType === '0') return String(currentIndex + 1);
    
    const uniqueGroupIds = Array.from(new Set(questions.map(q => q.group_id)));
    return String(uniqueGroupIds.indexOf(question.group_id) + 1);
  }, [questions, currentIndex, question, questionType]);

  /**
   * 🗺️ 利用者が何をするかの「タスク進行ステップ」の配列定義
   */
  const userActionSteps = useMemo(() => {
    // シンプルな名詞のみの表記に統一
    if (questionType === '0') {
      return ["質問文", "回答"]; // Speed
    } else if (questionType === '6') {
      return ["基本文", "質問文", "回答"]; // Mastery
    } else {
      return ["基本文", "指示文", "回答"]; // Builders, Structure
    }
  }, [questionType]);

  /**
   * 🎯 修正：指示・質問文の再生が終わったら（＝audioPhase が answer になったら）回答状態に進む
   */
  const currentActionIndex = useMemo(() => {
    if (isRevealed) return userActionSteps.length; // 解答表示後はすべて完了
    
    if (questionType === '0') {
      // UG Speed
      if (audioPhase === 'question') return 0; // まだ再生中
      if (audioPhase === 'answer') return 1;   // 再生終了 ➔ 回答状態
      return 0;
    } else {
      // Builders, Structure, Mastery
      if (audioPhase === 'statement') return 0;
      if (audioPhase === 'question') return 1;  // 指示・質問文を再生中
      if (audioPhase === 'answer') return 2;    // 再生終了 ➔ 回答状態へ進む
      return 0;
    }
  }, [audioPhase, isRevealed, questionType, userActionSteps.length]);

  // 再生状態の日本語テキスト中央 HUD 用
  const statusMessage = useMemo(() => {
    if (isRevealed) return { text: "解答をCheck", color: "text-slate-400" };
    switch (audioPhase) {
      case 'statement':
        return { text: "基本文を再生中...", color: "text-indigo-600" };
      case 'question':
        return { text: `${config.phaseLabel}を再生中...`, color: "text-indigo-600" };
      case 'answer':
        return { text: "回答しましょう", color: "text-amber-500" };
      default:
        return { text: "待機中", color: "text-slate-400" };
    }
  }, [audioPhase, isRevealed, config.phaseLabel]);

  // 🛡️ 全てのHook呼び出しの後に配置（エラー回避）
  if (!question) {
    return <div className="flex-1 w-full animate-pulse bg-slate-50/50 rounded-[40px]" />;
  }

  const triggerAudio = (e: React.MouseEvent, voiceUrl: string | null, text: string) => {
    e.stopPropagation();
    if (isAutoPlaying) return;
    if (onPlayAudio) onPlayAudio(voiceUrl, text);
  };

  // ドリルモードかつ、問題表示ボタンを押していない隠蔽状態フラグ
  const isHidingProblemText = isDrillMode && !isProblemVisible;

  return (
    <div className="w-full flex flex-col items-stretch text-left select-none gap-y-3">
      
      {/* ──────────────────────────────────────────────────────────── */}
      {/* 【ヘッダー領域】位置を確実に固定するために absolute を廃止 */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="w-full flex items-center pb-1 px-0.5">
        {/* 🏆 コンパウンド・バッジ：Question と Step を1つのユニットに統合 */}
        <div className="flex items-center bg-indigo-600 rounded-[14px] shadow-sm overflow-hidden border border-indigo-600">
          {/* Question 部分 */}
          <div className="flex items-center gap-2.5 px-3 py-1.5">
            <span className="text-[9px] font-black text-indigo-200 uppercase tracking-[0.2em] leading-none">Question</span>
            <span className="text-sm font-black text-white font-mono leading-none">
              {questionNumberLabel}
            </span>
          </div>

          {/* Step 部分（Speed以外のみ表示：白抜きデザイン） */}
          {questionType !== '0' && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-l border-indigo-600 self-stretch">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Step</span>
              <span className="text-xs font-bold text-indigo-600 font-mono leading-none">
                {groupCurrentIndex + 1} <span className="text-slate-300 mx-0.5">/</span> {groupTotalCount}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 【メインエリア】タスク進行状況 ＆ 再生アイコン HUD */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="w-full flex flex-col items-stretch bg-slate-50/40 rounded-[24px] border border-slate-100 p-4 sm:p-5">
        {/* タスク進行バー：問題テキスト表示時も隠さず常時表示 */}
        <AnimatePresence initial={false}>
          <motion.div 
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: "1rem" }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="w-full overflow-hidden"
          >
            <div className="w-full flex items-center justify-between gap-1 sm:gap-2 px-0.5 pt-0.5">
              {userActionSteps.map((stepName, index) => {
                const isCurrent = index === currentActionIndex;
                const isCompleted = index < currentActionIndex;
                return (
                  <div key={stepName} className="flex-1 flex flex-col gap-1 text-center relative">
                    {/* ステップバーのライン */}
                    <div className="h-[3px] w-full rounded-full bg-slate-200 overflow-hidden relative">
                      <motion.div
                        initial={false}
                        animate={{ x: isCompleted || isCurrent ? "0%" : "-100%" }}
                        transition={{ duration: 0.25 }}
                        className={cn(
                          "absolute inset-0",
                          isCompleted ? "bg-emerald-500" : "bg-indigo-500"
                        )}
                      />
                    </div>
                    {/* ステップ文言 */}
                    <span className={cn(
                      "text-[9px] font-black tracking-tight transition-colors duration-200",
                      isCurrent ? "text-indigo-600 font-extrabold" : 
                      isCompleted ? "text-emerald-600" : "text-slate-400"
                    )}>
                      {stepName}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* 再生状態メッセージ ＆ 丸型アイコン：常時表示 */}
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex items-center gap-x-4">
            <div className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center shadow-xs border shrink-0 transition-all duration-300",
              isRevealed ? "bg-slate-100 border-slate-200 text-slate-400" :
              audioPhase === 'statement' ? "bg-indigo-50 border-indigo-200 text-indigo-600" :
              audioPhase === 'question' ? "bg-indigo-50 border-indigo-200 text-indigo-600" :
              audioPhase === 'answer' ? "bg-amber-50 border-amber-200 text-amber-500" : "bg-slate-100 border-slate-200 text-slate-400"
            )}>
              {audioPhase === 'answer' && !isRevealed ? (
                <CircleDot size={20} className="animate-ping" />
              ) : (
                <Headphones size={20} className={cn(audioPhase !== 'idle' && !isRevealed && "animate-pulse")} />
              )}
            </div>
            
            <div className="flex flex-col text-left">
              <h3 className={cn("text-[11px] font-black uppercase tracking-wider leading-none", statusMessage.color)}>
                {statusMessage.text}
              </h3>
            </div>
          </div>

          {/* 👁️ 問題をテキスト表示するためのトリガー（解答開示後、かつ未表示の場合のみ出現） */}
          {isDrillMode && isRevealed && !isProblemVisible && (
            <button
              onClick={(e) => { e.stopPropagation(); setIsProblemVisible(true); }}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-indigo-600 border border-indigo-100 shadow-sm transition-all text-[10px] font-black uppercase tracking-tight cursor-pointer active:scale-95 ml-auto"
            >
              <Eye size={13} strokeWidth={2.5} />
              <span>問題を表示</span>
            </button>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 【コンテンツエリア】元の洗練されたデザインベース */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-y-4 sm:gap-y-5 w-full mt-2 relative">
        
        {/* 🎯 修正：【A】基本文セクション（問題テキスト表示アクション前は丸ごと非表示） */}
        {!isSprintMode && question.statement && !isHidingProblemText && (
          <div className="w-full text-left border-l-4 border-slate-200 pl-3 sm:pl-4 py-0.5 animate-in fade-in duration-350 flex flex-col gap-1">
            <div className="flex items-center w-full mb-0.5">
              <div className="flex items-center gap-x-1.5 text-slate-400">
                <MessageSquare size={12} />
                <span className="text-[10px] font-bold tracking-wider leading-none">基本文</span>
                <button 
                  onClick={(e) => triggerAudio(e, question.statement_voice, question.statement || "")}
                  disabled={isAutoPlaying}
                  className="w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:text-indigo-500 hover:bg-slate-100 transition-colors cursor-pointer outline-none active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                  title="音声を再生"
                >
                  <Volume2 size={13} />
                </button>
                {question.statement_ja && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowJaStatement(!showJaStatement); }}
                    className={cn("w-6 h-6 flex items-center justify-center rounded-md transition-all", showJaStatement ? "bg-indigo-50 text-indigo-600" : "text-slate-300 hover:text-slate-400 hover:bg-slate-50")}
                    title="和訳を切り替え"
                  >
                    <Languages size={13} />
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm sm:text-base font-bold text-slate-600 leading-relaxed tracking-tight">
              {showJaStatement ? question.statement_ja : question.statement}
            </p>
          </div>
        )}

        {/* 🎯 修正：【B】質問 / 指示セクション（問題テキスト表示アクション前は丸ごと非表示） */}
        {!isHidingProblemText && (
          <div className="w-full text-left border-l-4 border-indigo-500 pl-3 sm:pl-4 py-0.5 animate-in fade-in duration-350 flex flex-col gap-1">
            <div className="flex items-center w-full mb-0.5">
              <div className="flex items-center gap-x-1.5 text-indigo-500">
                <HelpCircle size={13} strokeWidth={2.5} />
                <span className="text-[10px] font-bold tracking-wider leading-none">{config.sectionTitle}</span>
                <button 
                  onClick={(e) => triggerAudio(e, question.question_voice, question.question)}
                  disabled={isAutoPlaying}
                  className="w-5 h-5 flex items-center justify-center rounded-full text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer outline-none active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                  title="音声を再生"
                >
                  <Volume2 size={13} strokeWidth={2.5} />
                </button>
                {question.question_ja && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowJaQuestion(!showJaQuestion); }}
                    className={cn("w-6 h-6 flex items-center justify-center rounded-md transition-all", showJaQuestion ? "bg-indigo-50 text-indigo-600" : "text-slate-300 hover:text-slate-400 hover:bg-slate-50")}
                    title="和訳を切り替え"
                  >
                    <Languages size={13} />
                  </button>
                )}
              </div>
            </div>
            <p className="text-2xl sm:text-[32px] font-black text-slate-800 leading-[1.25] tracking-tighter antialiased">
              {showJaQuestion ? question.question_ja : question.question}
            </p>
          </div>
        )}

        {/* 【C】解答表示エリア ＆ 各種アクションコントロールボタン */}
        <div className="w-full min-h-[90px] flex flex-col items-stretch justify-center mt-1">
          <AnimatePresence mode="wait">
            {!isRevealed ? (
              /* 未回答状態：「タップして解答を表示」ボタンを大きく配置 */
              <motion.div
                key="reveal-action-container"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="w-full flex flex-col gap-3"
              >
                <button
                  onClick={() => { if (!isAutoPlaying) handleReveal(true); }}
                  disabled={isAutoPlaying}
                  className={cn(
                    "w-full min-h-[80px] sm:min-h-[92px] flex flex-col items-center justify-center border border-dashed rounded-[20px] px-4 py-3 outline-none focus:ring-2 transition-all cursor-pointer",
                    isAutoPlaying 
                      ? "border-slate-200 bg-slate-50/40 text-slate-400 cursor-not-allowed" 
                      : "border-indigo-300 bg-indigo-50/20 hover:bg-indigo-50/40 text-indigo-600 shadow-2xs focus:ring-indigo-500/20"
                  )}
                >
                  <div className="flex items-center justify-center gap-2">
                    {!isAutoPlaying && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping shrink-0" />
                    )}
                    <span className={cn("text-xs font-black tracking-[0.15em]", isAutoPlaying ? "text-slate-400" : "text-indigo-700")}>
                      {isAutoPlaying ? "自動再生中..." : "タップして解答を表示"}
                    </span>
                    {!isAutoPlaying && <ArrowRight size={13} strokeWidth={2.5} className="text-indigo-500" />}
                  </div>
                </button>
              </motion.div>
            ) : (
              /* 解答テキスト開示後フェーズ */
              <motion.div
                key="answer-content-container"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full flex flex-col gap-4"
              >
                {/* 解答文（Speed専用 2カラム or 通常 1カラムモデル） */}
                {question.answer_sentence_no ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    <div className="text-left border-l-4 border-emerald-500 bg-emerald-50/20 pl-4 pr-2 py-2 rounded-r-xl flex flex-col gap-1">
                      <div className="flex items-center w-full mb-0.5">
                        <div className="flex items-center gap-x-1.5 text-emerald-600">
                          <CheckCircle2 size={12} strokeWidth={2.5} />
                          <span className="text-[9px] font-bold tracking-wider">解答（YES）</span>
                          <button 
                            onClick={(e) => triggerAudio(e, question.answer_sentence_yes_voice, question.answer_sentence_yes)}
                            disabled={isAutoPlaying}
                            className="w-4 h-4 flex items-center justify-center text-emerald-500 hover:bg-emerald-100 rounded-full"
                          >
                            <Volume2 size={11} strokeWidth={2.5} />
                          </button>
                          {question.answer_sentence_yes_ja && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowJaAnswer(!showJaAnswer); }}
                              className={cn("w-5 h-5 flex items-center justify-center rounded-md transition-all", showJaAnswer ? "bg-emerald-100 text-emerald-600" : "text-emerald-400/60 hover:text-emerald-600 hover:bg-emerald-100/50")}
                            >
                              <Languages size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-lg sm:text-xl font-black text-emerald-700 leading-snug tracking-tight">
                        {showJaAnswer ? question.answer_sentence_yes_ja : question.answer_sentence_yes}
                      </p>
                    </div>

                    <div className="text-left border-l-4 border-amber-500 bg-amber-50/20 pl-4 pr-2 py-2 rounded-r-xl flex flex-col gap-1">
                      <div className="flex items-center w-full mb-0.5">
                        <div className="flex items-center gap-x-1.5 text-amber-600">
                          <CheckCircle2 size={12} strokeWidth={2.5} />
                          <span className="text-[9px] font-bold tracking-wider">解答（NO）</span>
                          <button 
                            onClick={(e) => triggerAudio(e, question.answer_sentence_no_voice, question.answer_sentence_no || "")}
                            disabled={isAutoPlaying}
                            className="w-4 h-4 flex items-center justify-center text-amber-500 hover:bg-amber-100 rounded-full"
                          >
                            <Volume2 size={11} strokeWidth={2.5} />
                          </button>
                          {question.answer_sentence_no_ja && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowJaAnswer(!showJaAnswer); }}
                              className={cn("w-5 h-5 flex items-center justify-center rounded-md transition-all", showJaAnswer ? "bg-amber-100 text-amber-600" : "text-amber-400/60 hover:text-amber-600 hover:bg-amber-100/50")}
                            >
                              <Languages size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-lg sm:text-xl font-black text-amber-700 leading-snug tracking-tight">
                        {showJaAnswer ? question.answer_sentence_no_ja : question.answer_sentence_no}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full text-left border-l-4 border-emerald-500 bg-emerald-50/25 pl-4 pr-3 py-2.5 rounded-r-xl flex flex-col gap-0.5">
                    <div className="flex items-center w-full mb-0.5">
                      <div className="flex items-center gap-x-1.5 text-emerald-600">
                        <CheckCircle2 size={13} strokeWidth={2.5} />
                        <span className="text-[10px] font-bold tracking-wider uppercase">解答</span>
                        <button 
                          onClick={(e) => triggerAudio(e, question.answer_sentence_yes_voice, question.answer_sentence_yes)}
                          disabled={isAutoPlaying}
                          className="w-5 h-5 flex items-center justify-center rounded-full text-emerald-500 hover:bg-emerald-100"
                        >
                          <Volume2 size={12} strokeWidth={2.5} />
                        </button>
                        {question.answer_sentence_yes_ja && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowJaAnswer(!showJaAnswer); }}
                            className={cn("w-6 h-6 flex items-center justify-center rounded-md transition-all", showJaAnswer ? "bg-emerald-100 text-emerald-600" : "text-emerald-400/60 hover:text-emerald-600 hover:bg-emerald-100/50")}
                          >
                            <Languages size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-emerald-600 leading-snug tracking-tight">
                      {showJaAnswer ? question.answer_sentence_yes_ja : question.answer_sentence_yes}
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
};