'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SprintQuestionType } from "@gabby/types/sprint";
import { HelpCircle, MessageSquare, CheckCircle2, Volume2, Eye, CircleDot, Headphones, Languages, Mic } from 'lucide-react';

// 🔌 Zustand ストアのインポート
import { useSprintStore } from '@/stores/useSprintStore';
import { cn } from '@/lib/utils';

interface QuestionCardProps {
  groupCurrentIndex?: number;
  groupTotalCount?: number;
  onPlayAudio?: (voiceUrl: string | null, text: string) => void;
  onStartRecord?: () => void;
  audioPhase?: 'idle' | 'statement' | 'question' | 'answer';
  isRecording?: boolean; // 🎙️ 親から渡される録音中フラグ
  timeLeft?: number;     // ⏱️ 親から渡される残り時間（秒）
  maxTime?: number;      // ⏱️ 円形プログレス計算用の最大制限時間（デフォルト: 10）
}

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
  onStartRecord,
  audioPhase = 'idle',
  isRecording = false,
  timeLeft = 0,
  maxTime = 10,
}) => {
  
  const question = useSprintStore((state) => state.questions[state.currentIndex]);
  const questions = useSprintStore((state) => state.questions);
  const currentIndex = useSprintStore((state) => state.currentIndex);
  const mode = useSprintStore((state) => state.mode);
  const questionType = useSprintStore((state) => state.questionType);
  const isRevealed = useSprintStore((state) => state.isRevealed);
  const isAutoPlaying = useSprintStore((state) => state.isAutoPlaying);
  const setDrillEvalType = useSprintStore((state) => state.setDrillEvalType);
  const drillEvalType = useSprintStore((state) => state.drillEvalType);

  const [isProblemVisible, setIsProblemVisible] = useState(false);
  const [showJaStatement, setShowJaStatement] = useState(false);
  const [showJaQuestion, setShowJaQuestion] = useState(false);
  const [showJaAnswer, setShowJaAnswer] = useState(false);
  const [prevIndex, setPrevIndex] = useState(currentIndex);
  const [prevIsRecording, setPrevIsRecording] = useState(isRecording);

  if (currentIndex !== prevIndex) {
    setPrevIndex(currentIndex);
    setIsProblemVisible(false);
    setShowJaStatement(false);
    setShowJaQuestion(false);
    setShowJaAnswer(false);
  }

  if (isRecording !== prevIsRecording) {
    setPrevIsRecording(isRecording);
    if (isRecording) {
      setIsProblemVisible(false);
      setShowJaStatement(false);
      setShowJaQuestion(false);
      setShowJaAnswer(false);
    }
  }

  const config = SPRINT_LABELS[questionType || '0'] || { sectionTitle: "問題", instruction: "", phaseLabel: "問題文" };
  const isSprintMode = mode === 'sprint';
  const isDrillMode = mode === 'drill';

  const questionNumberLabel = useMemo(() => {
    if (!question) return '';
    if (questionType === '0') return String(currentIndex + 1);
    
    const uniqueGroupIds = Array.from(new Set(questions.map(q => q.group_id)));
    return String(uniqueGroupIds.indexOf(question.group_id) + 1);
  }, [questions, currentIndex, question, questionType]);

  const userActionSteps = useMemo(() => {
    if (questionType === '0') return ["質問文", "回答"];
    return questionType === '6' ? ["基本文", "質問文", "回答"] : ["基本文", "指示文", "回答"];
  }, [questionType]);

  const currentActionIndex = useMemo(() => {
    if (isRecording) return userActionSteps.length - 1;
    if (isRevealed) return userActionSteps.length;
    
    if (questionType === '0') {
      return audioPhase === 'answer' ? 1 : 0;
    } else {
      if (audioPhase === 'statement') return 0;
      if (audioPhase === 'question') return 1;
      return audioPhase === 'answer' ? 2 : 0;
    }
  }, [audioPhase, isRevealed, isRecording, questionType, userActionSteps.length]);

  const statusMessage = useMemo(() => {
    if (isRecording) return { text: `音声録音中...`, color: "text-rose-500 font-extrabold" };
    if (isRevealed) return { text: "解答をCheck", color: "text-slate-400" };
    switch (audioPhase) {
      case 'statement': return { text: "基本文を再生中...", color: "text-indigo-600" };
      case 'question': return { text: `${config.phaseLabel}を再生中...`, color: "text-indigo-600" };
      case 'answer': return { text: "回答しましょう", color: "text-amber-500" };
      default: return { text: "待機中", color: "text-slate-400" };
    }
  }, [audioPhase, isRevealed, isRecording, config.phaseLabel, timeLeft]);

  const displayPhase = useMemo(() => {
    if (isRecording) return 'recording';
    if (isRevealed) return 'revealed';
    return 'idle';
  }, [isRevealed, isRecording]);

  // ⭕ 円形プログレスバー用の定数と計算
  const RADIUS = 24;
  const CIRCUMFERENCE = useMemo(() => 2 * Math.PI * RADIUS, []);

  const strokeDashoffset = useMemo(() => {
    // タイムアップ時は確実に 0 (プログレスが0 = オフセットを円周最大) に倒す
    if (timeLeft <= 0) return CIRCUMFERENCE;
    const progress = Math.max(0, Math.min(timeLeft, maxTime)) / maxTime;
    return CIRCUMFERENCE * (1 - progress);
  }, [timeLeft, maxTime, CIRCUMFERENCE]);

  if (!question) {
    return <div className="flex-1 w-full animate-pulse bg-slate-50/50 rounded-[40px]" />;
  }

  const triggerAudio = (e: React.MouseEvent, voiceUrl: string | null, text: string) => {
    e.stopPropagation();
    if (isAutoPlaying || isRecording) return;
    if (onPlayAudio) onPlayAudio(voiceUrl, text);
  };

  const isHidingProblemText = isDrillMode && !isProblemVisible;

  return (
    <div className="w-full flex flex-col items-stretch text-left select-none gap-y-2 sm:gap-y-4">
      
      {/* 【ヘッダー領域】 */}
      <div className="w-full flex items-center pb-0.5 px-0.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-indigo-600 rounded-[14px] shadow-sm overflow-hidden border border-indigo-600">
            <div className="flex items-center gap-2.5 px-3 py-1.5">
              <span className="text-[9px] font-black text-indigo-200 uppercase tracking-[0.2em] leading-none">Question</span>
              <span className="text-sm font-black text-white font-mono leading-none">{questionNumberLabel}</span>
            </div>
            {questionType !== '0' && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-l border-indigo-600 self-stretch">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Step</span>
                <span className="text-xs font-bold text-indigo-600 font-mono leading-none">
                  {groupCurrentIndex + 1} <span className="text-slate-300 mx-0.5">/</span> {groupTotalCount}
                </span>
              </div>
            )}
          </div>

          {questionType === '0' && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">発話評価</span>
              <div className="flex bg-slate-200/50 p-0.5 rounded-lg border border-slate-200 h-8">
                <button 
                  onClick={(e) => { e.stopPropagation(); setDrillEvalType('yes'); }}
                  className={cn("px-2.5 py-1 text-[9px] font-black rounded-md transition-all cursor-pointer", drillEvalType === 'yes' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600")}
                >YES</button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setDrillEvalType('no'); }}
                  className={cn("px-2.5 py-1 text-[9px] font-black rounded-md transition-all cursor-pointer", drillEvalType === 'no' ? "bg-white text-amber-600 shadow-sm" : "text-slate-400 hover:text-slate-600")}
                >NO</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 【メインエリア】 */}
      <div className="w-full flex flex-col items-stretch bg-slate-50/40 rounded-[24px] border border-slate-100 p-3.5 sm:p-5">
        <AnimatePresence initial={false}>
          <motion.div 
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: "0.5rem" }}
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
                    <div className="h-[3px] w-full rounded-full bg-slate-200 overflow-hidden relative">
                      <motion.div
                        initial={false}
                        animate={{ x: isCompleted || isCurrent ? "0%" : "-100%" }}
                        transition={{ duration: 0.25 }}
                        className={cn(
                          "absolute inset-0",
                          isCompleted ? "bg-emerald-500" : isRecording && isCurrent ? "bg-rose-500" : "bg-indigo-500"
                        )}
                      />
                    </div>
                    <span className={cn(
                      "text-[9px] font-black tracking-tight transition-colors duration-200",
                      isRecording && isCurrent ? "text-rose-500 font-extrabold" :
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

        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex items-center gap-x-3 sm:gap-x-4">
            <div className={cn(
              "w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shadow-xs border shrink-0 transition-all duration-300",
              isRecording ? "bg-rose-50 border-rose-200 text-rose-500" :
              isRevealed ? "bg-slate-100 border-slate-200 text-slate-400" :
              audioPhase === 'statement' || audioPhase === 'question' ? "bg-indigo-50 border-indigo-200 text-indigo-600" :
              audioPhase === 'answer' ? "bg-amber-50 border-amber-200 text-amber-500" : "bg-slate-100 border-slate-200 text-slate-400"
            )}>
              {isRecording ? <Mic size={18} /> : audioPhase === 'answer' && !isRevealed ? <CircleDot size={18} /> : <Headphones size={18} className={cn(audioPhase !== 'idle' && !isRevealed && "animate-pulse")} />}
            </div>
            
            <div className="flex flex-col text-left">
              <h3 className={cn("text-[11px] font-black uppercase tracking-wider leading-none", statusMessage.color)}>
                {statusMessage.text}
              </h3>
              {audioPhase === 'answer' && !isRevealed && !isRecording && (
                <div className="flex items-center gap-1 mt-1 text-slate-400">
                  <Mic size={10} className="text-rose-400" fill="currentColor" />
                  <span className="text-[9px] font-bold leading-none">マイクボタンで発話評価</span>
                </div>
              )}
            </div>
          </div>

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

      {/* 【コンテンツエリア】 */}
      <div className="flex flex-col gap-y-2.5 sm:gap-y-5 w-full mt-1 sm:mt-2 relative">
        {/* 【A】基本文セクション */}
        <AnimatePresence>
          {!isSprintMode && question.statement_en && !isHidingProblemText && (
            <motion.div 
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="w-full text-left border-l-4 border-slate-200 pl-3 sm:pl-4 py-0.5 flex flex-col gap-1"
            >
              <div className="flex items-center w-full mb-0.5">
                <div className="flex items-center gap-x-1.5 text-slate-400">
                  <MessageSquare size={12} />
                  <span className="text-[10px] font-bold tracking-wider leading-none">基本文</span>
                  <button 
                    onClick={(e) => triggerAudio(e, question.statement_voice, question.statement_en || "")}
                    disabled={isAutoPlaying || isRecording}
                    className="w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:text-indigo-500 hover:bg-slate-100 transition-colors cursor-pointer outline-none active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Volume2 size={13} />
                  </button>
                  {question.statement_ja && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowJaStatement(!showJaStatement); }}
                      className={cn("w-6 h-6 flex items-center justify-center rounded-md transition-all cursor-pointer", showJaStatement ? "bg-indigo-50 text-indigo-600" : "text-slate-300 hover:text-slate-400 hover:bg-slate-50")}
                    >
                      <Languages size={13} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm sm:text-base font-bold text-slate-600 leading-relaxed tracking-tight">
                {showJaStatement ? question.statement_ja : question.statement_en}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 【B】質問 / 指示セクション */}
        <AnimatePresence>
          {!isHidingProblemText && (
            <motion.div 
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="w-full text-left border-l-4 border-indigo-500 pl-3 sm:pl-4 py-0.5 flex flex-col gap-1"
            >
              <div className="flex items-center w-full mb-0.5">
                <div className="flex items-center gap-x-1.5 text-indigo-500">
                  <HelpCircle size={13} strokeWidth={2.5} />
                  <span className="text-[10px] font-bold tracking-wider leading-none">{config.sectionTitle}</span>
                  <button 
                    onClick={(e) => triggerAudio(e, question.question_voice, question.question_en || "")}
                    disabled={isAutoPlaying || isRecording}
                    className="w-5 h-5 flex items-center justify-center rounded-full text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer outline-none active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Volume2 size={13} strokeWidth={2.5} />
                  </button>
                  {question.question_ja && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowJaQuestion(!showJaQuestion); }}
                      className={cn("w-6 h-6 flex items-center justify-center rounded-md transition-all cursor-pointer", showJaQuestion ? "bg-indigo-50 text-indigo-600" : "text-slate-300 hover:text-slate-400 hover:bg-slate-50")}
                    >
                      <Languages size={13} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xl sm:text-[32px] font-black text-slate-800 leading-[1.25] tracking-tighter antialiased">
                {showJaQuestion ? question.question_ja : question.question_en}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 【C】解答表示エリア ＆ 録音中 HUD 内包コンテナ */}
        <div className={cn("w-full flex flex-col items-stretch justify-center relative overflow-hidden", displayPhase === 'revealed' ? "min-h-0 mt-1 sm:mt-1" : "min-h-[160px] sm:min-h-[280px] mt-2 sm:mt-6")}>
          <AnimatePresence mode="popLayout">
            {displayPhase === 'idle' && (
              <motion.div
                key="reveal-placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 w-full h-full flex flex-col items-center justify-center group"
              >
                <div className="absolute inset-0 rounded-[24px] sm:rounded-[32px] border-2 border-dashed border-slate-100 bg-gradient-to-b from-slate-50/50 to-white/30 group-hover:border-indigo-100 group-hover:from-indigo-50/10 transition-colors duration-300" />
                <div className="relative z-10 flex flex-col items-center text-center space-y-3 sm:space-y-4">
                  <div className="space-y-0.5 sm:space-y-1">
                    <p className="text-[12px] sm:text-[11px] font-black tracking-[0.15em] sm:tracking-[0.2em] text-slate-400 uppercase group-hover:text-indigo-500 transition-colors">タップして解答を表示</p>
                    <p className="text-[10px] sm:text-[10px] font-bold text-slate-300 group-hover:text-slate-400 transition-colors">Tap anywhere to reveal</p>
                  </div>
                </div>
              </motion.div>
            )}

            {displayPhase === 'recording' && (
              <motion.div
                key="recording-hud"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-4"
              >
                <div className="absolute inset-0 rounded-[24px] sm:rounded-[32px] bg-rose-50/30 border border-rose-100/70" />
                <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                  
                  {/* ⏱️ 滑らかな円形プログレスHUD */}
                  <div className="relative flex items-center justify-center w-14 h-14">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="28" cy="28" r={RADIUS} className="stroke-rose-100/60" strokeWidth="3.5" fill="transparent" />
                      
                      <motion.circle
                        cx="28"
                        cy="28"
                        r={RADIUS}
                        className="stroke-rose-500"
                        strokeWidth="3.5"
                        fill="transparent"
                        strokeDasharray={CIRCUMFERENCE}
                        animate={{ strokeDashoffset }}
                        // ✨ ポイント：duration を 1秒にし、ease を linear にすることで1秒ごとの更新を綺麗に補間
                        // 開始直後やリセット時 (timeLeft === maxTime) のみ 0秒で瞬時に満タンにする
                        transition={{ 
                          duration: timeLeft === maxTime ? 0 : 1, 
                          ease: "linear" 
                        }}
                        strokeLinecap="round"
                      />
                    </svg>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-sm font-black font-mono text-rose-600 leading-none">{timeLeft}</span>
                      <span className="text-[6px] font-black uppercase text-rose-400 tracking-wider leading-none mt-0.5">sec</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-1.5 text-rose-600">
                      <Mic size={13} fill="currentColor" className="text-rose-500" />
                      <p className="text-xs font-black tracking-wider uppercase">Recording...</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium">はっきりと発話してください</p>
                  </div>
                </div>
              </motion.div>
            )}

            {displayPhase === 'revealed' && (
              <motion.div
                key="answer-content-container"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="w-full flex flex-col gap-2.5 sm:gap-4 relative z-10"
              >
                {question.answer_sentence_no_en ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    <div className="text-left border-l-4 border-emerald-500 bg-emerald-50/20 pl-4 pr-2 py-2 rounded-r-xl flex flex-col gap-1">
                      <div className="flex items-center w-full mb-0.5">
                        <div className="flex items-center gap-x-1.5 text-emerald-600">
                          <CheckCircle2 size={12} strokeWidth={2.5} />
                          <span className="text-[9px] font-bold tracking-wider">解答（YES）</span>
                          <button onClick={(e) => triggerAudio(e, question.answer_sentence_yes_voice, question.answer_sentence_yes_en)} disabled={isAutoPlaying} className="w-4 h-4 flex items-center justify-center text-emerald-500 hover:bg-emerald-100 rounded-full cursor-pointer">
                            <Volume2 size={11} strokeWidth={2.5} />
                          </button>
                          {question.answer_sentence_yes_ja && (
                            <button onClick={(e) => { e.stopPropagation(); setShowJaAnswer(!showJaAnswer); }} className={cn("w-5 h-5 flex items-center justify-center rounded-md transition-all cursor-pointer", showJaAnswer ? "bg-emerald-100 text-emerald-600" : "text-emerald-400/60 hover:text-emerald-600 hover:bg-emerald-100/50")}>
                              <Languages size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-lg sm:text-xl font-black text-emerald-700 leading-snug tracking-tight">{showJaAnswer ? question.answer_sentence_yes_ja : question.answer_sentence_yes_en}</p>
                    </div>

                    <div className="text-left border-l-4 border-amber-500 bg-amber-50/20 pl-4 pr-2 py-2 rounded-r-xl flex flex-col gap-1">
                      <div className="flex items-center w-full mb-0.5">
                        <div className="flex items-center gap-x-1.5 text-amber-600">
                          <CheckCircle2 size={12} strokeWidth={2.5} />
                          <span className="text-[9px] font-bold tracking-wider">解答（NO）</span>
                          <button onClick={(e) => triggerAudio(e, question.answer_sentence_no_voice, question.answer_sentence_no_en || "")} disabled={isAutoPlaying} className="w-4 h-4 flex items-center justify-center text-amber-500 hover:bg-amber-100 rounded-full cursor-pointer">
                            <Volume2 size={11} strokeWidth={2.5} />
                          </button>
                          {question.answer_sentence_no_ja && (
                            <button onClick={(e) => { e.stopPropagation(); setShowJaAnswer(!showJaAnswer); }} className={cn("w-5 h-5 flex items-center justify-center rounded-md transition-all cursor-pointer", showJaAnswer ? "bg-amber-100 text-amber-600" : "text-amber-400/60 hover:text-amber-600 hover:bg-amber-100/50")}>
                              <Languages size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-lg sm:text-xl font-black text-amber-700 leading-snug tracking-tight">{showJaAnswer ? question.answer_sentence_no_ja : question.answer_sentence_no_en}</p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full text-left border-l-4 border-emerald-500 bg-emerald-50/25 pl-4 pr-3 py-2.5 rounded-r-xl flex flex-col gap-0.5">
                    <div className="flex items-center w-full mb-0.5">
                      <div className="flex items-center gap-x-1.5 text-emerald-600">
                        <CheckCircle2 size={13} strokeWidth={2.5} />
                        <span className="text-[10px] font-bold tracking-wider uppercase">解答</span>
                        <button onClick={(e) => triggerAudio(e, question.answer_sentence_yes_voice, question.answer_sentence_yes_en || "")} disabled={isAutoPlaying} className="w-5 h-5 flex items-center justify-center rounded-full text-emerald-500 hover:bg-emerald-100 cursor-pointer">
                          <Volume2 size={12} strokeWidth={2.5} />
                        </button>
                        {question.answer_sentence_yes_ja && (
                          <button onClick={(e) => { e.stopPropagation(); setShowJaAnswer(!showJaAnswer); }} className={cn("w-6 h-6 flex items-center justify-center rounded-md transition-all cursor-pointer", showJaAnswer ? "bg-emerald-100 text-emerald-600" : "text-emerald-400/60 hover:text-emerald-600 hover:bg-emerald-100/50")}>
                            <Languages size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xl sm:text-2xl font-black text-emerald-600 leading-snug tracking-tight">{showJaAnswer ? question.answer_sentence_yes_ja : question.answer_sentence_yes_en}</p>
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