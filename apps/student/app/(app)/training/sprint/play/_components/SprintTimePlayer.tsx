'use client';

import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Volume2, RotateCcw, Timer, CircleDot, ArrowRight, CheckCircle2, Headphones, Mic, Square, FastForward, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { getFeedbackConfig, getSprintTitle, playStartSound } from '@gabby/lib';
import { SprintQuestion } from "@gabby/types/sprint";
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { useSprintStore } from '@/stores/useSprintStore';
import { createSprintScoreAction, SprintHistoryItem } from '@/actions/sprintAction';

interface SprintTimePlayerProps {
  questions: SprintQuestion[];
  onExit?: () => void;
}

export const SprintTimePlayer: React.FC<SprintTimePlayerProps> = ({ 
  questions = [],
  onExit
}) => {
  const router = useRouter();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // ────────────── 🔌 Zustand ストア ──────────────
  const {
    currentIndex,
    questionType,
    answerType,
    level,
    timeLimitSec,
    isRecording,
    clearSessionProgress,
    resetStore,
    commitAssessmentResult, 
    commitSkipResult,        
    setIsRecording,
    incrementAssessmentCount,
    contentName,
  } = useSprintStore();

  // ────────────── 📦 ローカル管理ステート ──────────────
  const [secondsLeft, setSecondsLeft] = useState<number>(timeLimitSec || 60);
  const [audioPhase, setAudioPhase] = useState<'idle' | 'statement' | 'question' | 'answer'>('idle');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [showTimeUpOverlay, setShowTimeUpOverlay] = useState<boolean>(false);

  // ────────────── 🔊 音声カスタムフック ──────────────
  const { speak: ttsSpeak, setSpeechRate: ttsSetRate, startAssessment, stopListening, timeLeft } = useWebSpeech();
  const { playbackRate, changePlaybackRate } = usePlayAudioSpeech(); 

  const currentQuestion = questions?.[currentIndex];
  const totalQuestions = questions?.length || 0;

  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);
  const flowIdRef = useRef<number>(0);
  const hasAutoStartedRef = useRef<boolean>(false);
  const skippedQuestionIdsRef = useRef<Set<string>>(new Set());
  const isPersistedRef = useRef<boolean>(false);

  const SHARED_BRAND_BUTTON = "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] shadow-md shadow-indigo-600/10 text-white border-none";

  const courseTitle = useMemo(() => {
    return getSprintTitle(questionType || '0', Number(level));
  }, [questionType, level]);

  const isSpeedMode = questionType === '0';
  const isQuestionBased = questionType === '0' || questionType === '6';

  const userActionSteps = useMemo(() => {
    if (isSpeedMode) return ["質問文", "回答"];
    return ["基本文", isQuestionBased ? "質問文" : "指示文", "回答"];
  }, [isSpeedMode, isQuestionBased]);

  const currentActionIndex = useMemo(() => {
    if (isSpeedMode) {
      if (audioPhase === 'question') return 0;
      if (audioPhase === 'answer') return 1;
      return 0;
    }
    if (audioPhase === 'statement') return 0;
    if (audioPhase === 'question') return 1;
    return 2;
  }, [audioPhase, isSpeedMode]);

  const groupData = useMemo(() => {
    if (!currentQuestion || !questions.length || isSpeedMode) {
      return { uniqueGroupIndex: 1, currentInGroup: 0, totalInGroup: 0 };
    }
    const currentGroupId = currentQuestion.group_id;
    const uniqueGroupIds = Array.from(new Set(questions.map(q => q.group_id)));
    const uniqueGroupIndex = uniqueGroupIds.indexOf(currentGroupId) + 1;
    const groupQuestions = questions.filter(q => q.group_id === currentGroupId);
    const currentInGroup = groupQuestions.findIndex(q => q.question_id === currentQuestion.question_id);

    return {
      uniqueGroupIndex: uniqueGroupIndex >= 1 ? uniqueGroupIndex : 1,
      currentInGroup,
      totalInGroup: groupQuestions.length
    };
  }, [currentQuestion, questions, isSpeedMode]);

  const timeRatio = useMemo(() => secondsLeft / (timeLimitSec || 60), [secondsLeft, timeLimitSec]);
  const isWarning = timeRatio <= 0.5 && timeRatio > 0.2;
  const isCritical = timeRatio <= 0.2;

  const progressPercent = useMemo(() => {
    if (secondsLeft <= 0 || !timeLimitSec) return 0;
    return (secondsLeft / timeLimitSec) * 100;
  }, [secondsLeft, timeLimitSec]);

  // 全てのオーディオ・発話を安全に即時ストップする
  const stopAllAudio = useCallback(() => {
    flowIdRef.current += 1; 
    if (nativeAudioRef.current) {
      nativeAudioRef.current.pause();
      nativeAudioRef.current = null;
    }
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
  }, []);

  const handlePersistAndRedirect = useCallback(async (currentSecondsLeft: number) => {
    if (isPersistedRef.current) return;
    isPersistedRef.current = true;
    setIsSaving(true); 

    const storeState = useSprintStore.getState();
    const { sprintType, contentId, sessionResults } = storeState;

    // 4つの必須パラメータが揃っているかチェック（型ガード）
    if (!sprintType || !contentId || !questionType || !answerType) {
      console.error("Missing required sprint parameters:", { sprintType, contentId, questionType, answerType });
      showToast("パラメータが不足しているため、実績を保存できませんでした。", "error");
      setIsSaving(false);
      onExit?.();
      return;
    }

    const answeredCount = currentSecondsLeft <= 0 ? currentIndex : Math.min(currentIndex + 1, questions.length);
    const slicedQuestions = questions.slice(0, answeredCount);

    const history: SprintHistoryItem[] = slicedQuestions.map((q, idx) => {
      const resultRecord = sessionResults.find(r => r.questionId === q.question_id);
      return {
        question_id: q.question_id,
        group_id: q.group_id || null,
        seq_no: idx + 1, 
        is_skipped: resultRecord?.isSkipped || false,
        assessment: resultRecord?.feedback ? {
          total_score: resultRecord?.analysis ? Math.round(resultRecord.analysis.score * 100) : 100
        } : null,
      };
    });

    try {
      const res = await createSprintScoreAction({
        sprint_type: sprintType,
        content_id: contentId,
        question_type: questionType as "0" | "4" | "5" | "6",
        answer_type: answerType,
        difficulty_level: Number(level),
        time_limit_sec: timeLimitSec,
        total_answered: answeredCount,
        history: history,
      });

      if (res.success && res.data) {
        setResultId(res.data.self_sprint_id);
        if (currentSecondsLeft <= 0) {
          setShowTimeUpOverlay(true);
        } else {
          stopAllAudio();
          resetStore();
          router.push(`/training/sprint/result/${res.data.self_sprint_id}`);
        }
      } else {
        throw new Error(res.error || "Failed to persist score history");
      }
    } catch (err) {
      console.error("Sprint score save transaction failed:", err);
      showToast("実績の保存に失敗しました。一覧に戻ります。", "error");
      resetStore();
      onExit?.();
    } finally {
      setIsSaving(false);
    }
  }, [stopAllAudio, resetStore, router, showToast, onExit, currentIndex, questions, questionType, answerType, level, timeLimitSec]);

  const handleGoToResult = useCallback(() => {
    if (resultId) {
      stopAllAudio();
      resetStore(); 
      router.push(`/training/sprint/result/${resultId}`);
    }
  }, [resultId, router, stopAllAudio, resetStore]);

  const playTrack = useCallback((text: string, audioPath: string | null): Promise<void> => {
    return new Promise((resolve) => {
      if (nativeAudioRef.current) { nativeAudioRef.current.pause(); nativeAudioRef.current = null; }
      if (typeof window !== 'undefined') window.speechSynthesis.cancel();

      if (audioPath) {
        const bucketUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${audioPath}`;
        const audio = new Audio(bucketUrl);
        audio.playbackRate = playbackRate; 
        nativeAudioRef.current = audio;
        
        audio.onended = () => resolve();
        audio.onerror = () => {
          ttsSpeak(text, playbackRate);
          const checkTtsEnd = setInterval(() => {
            if (!window.speechSynthesis.speaking) { clearInterval(checkTtsEnd); resolve(); }
          }, 100);
        };
        audio.play().catch(() => resolve());
      } else {
        ttsSpeak(text, playbackRate);
        const checkTtsEnd = setInterval(() => {
          if (!window.speechSynthesis.speaking) { clearInterval(checkTtsEnd); resolve(); }
        }, 100);
      }
    });
  }, [playbackRate, ttsSpeak]);

  const runSprintFlow = useCallback(async (question: SprintQuestion, currentFlowId: number) => {
    if (!question) return;

    hasAutoStartedRef.current = false;
    try {
      if (question.statement_en) {
        setAudioPhase('statement');
        await playTrack(question.statement_en, question.statement_voice);
        if (flowIdRef.current !== currentFlowId) return; 
        await new Promise(r => setTimeout(r, 400));
        if (flowIdRef.current !== currentFlowId) return;
      }

      setAudioPhase('question');
      await playTrack(question.question_en, question.question_voice);
      if (flowIdRef.current !== currentFlowId) return; 

      setAudioPhase('answer'); 
    } catch (e) {
      console.error("Sprint flow error:", e);
      if (flowIdRef.current === currentFlowId) {
        setAudioPhase('answer'); 
      }
    }
  }, [playTrack]);

  // ────────────── 🎤 録音・発話制御コア ──────────────
  const handleStartRecord = useCallback(() => {
    if (!currentQuestion) return;
    playStartSound();
    
    // ✨【修正】ここで stopAllAudio() を呼ぶと flowId が進み、再生の無限ループを引き起こすため削除しました。
    setAudioPhase('answer');
    setIsRecording(true);
    
    const targetText = isSpeedMode
      ? (answerType === '1' ? (currentQuestion.answer_sentence_no_en ?? "") : currentQuestion.answer_sentence_yes_en)
      : currentQuestion.answer_sentence_yes_en;

    if (!targetText) {
      setIsRecording(false);
      return;
    }

    const cleanWords = targetText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"").split(" ").filter(Boolean);

    const currentQuestionId = currentQuestion.question_id;

    startAssessment(targetText, cleanWords, (result) => {
      // スキップされた問題の場合は、非同期の評価コミットを行わない
      if (skippedQuestionIdsRef.current.has(currentQuestionId)) {
        return;
      }

      setIsRecording(false);
      incrementAssessmentCount();

      const { isLast } = commitAssessmentResult(
        currentQuestionId,
        getFeedbackConfig(result.score),
        result
      );

      if (isLast) {
        showToast("すべての問題を消化しました！スプリント完了です。", "success");
        handlePersistAndRedirect(secondsLeft);
      }
    });
  }, [currentQuestion, isSpeedMode, answerType, setIsRecording, startAssessment, incrementAssessmentCount, commitAssessmentResult, showToast, handlePersistAndRedirect, secondsLeft]);

  const handleStopRecord = useCallback(() => {
    setIsRecording(false);
    stopListening();
  }, [setIsRecording, stopListening]);

  const handleSkipQuestion = useCallback(() => {
    if (!currentQuestion) return;

    skippedQuestionIdsRef.current.add(currentQuestion.question_id);

    handleStopRecord();
    stopAllAudio();

    const { isLast } = commitSkipResult(currentQuestion.question_id);
    if (isLast) {
      showToast("スプリントを終了します。", "success");
      handlePersistAndRedirect(secondsLeft);
    }
  }, [commitSkipResult, showToast, handlePersistAndRedirect, secondsLeft, currentQuestion, handleStopRecord, stopAllAudio]);

  // ────────────── 🔄 副作用 (Effects) ──────────────
  // 回答フェーズ（answer）に遷移した際に自動で発話開始（録音）を行う
  useEffect(() => {
    if (
      audioPhase === 'answer' &&
      !isRecording &&
      !isSaving &&
      !showTimeUpOverlay &&
      !hasAutoStartedRef.current
    ) {
      hasAutoStartedRef.current = true;
      handleStartRecord();
    }
  }, [audioPhase, isRecording, isSaving, showTimeUpOverlay, handleStartRecord]);

  // 全体の残り制限時間カウント
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [secondsLeft]);

  // タイムアップ判定
  useEffect(() => {
    if (secondsLeft <= 0) {
      handlePersistAndRedirect(0);
    }
  }, [secondsLeft, handlePersistAndRedirect]);

  // タイムアップ完了時の自動遷移
  useEffect(() => {
    if (showTimeUpOverlay && resultId) {
      const timer = setTimeout(() => {
        handleGoToResult();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [showTimeUpOverlay, resultId, handleGoToResult]);

  // ストアの初期値同期およびクリーンアップ
  useEffect(() => {
    setSecondsLeft(timeLimitSec);
    return () => {
      clearSessionProgress();
    };
  }, [timeLimitSec, clearSessionProgress]);

  // インデックス（問題ID）変更時にフローを最初から走らせる
  useEffect(() => {
    if (!currentQuestion || secondsLeft <= 0 || showTimeUpOverlay || isSaving) return;

    // ✨【修正】問題が変わった「その一瞬」だけ、オーディオを停止してフローIDを進めます
    stopAllAudio();
    setAudioPhase('idle');
    hasAutoStartedRef.current = false;
    
    const currentFlowId = flowIdRef.current;
    (async () => {
      await runSprintFlow(currentQuestion, currentFlowId);
    })();

    // 毎秒変わるステートによる再トリガーを避けるため、問題IDを基準に限定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentQuestion?.question_id, showTimeUpOverlay, isSaving]);

  // DOM/オーディオの強制クリーンアップ
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
      stopAllAudio();
      setIsRecording(false);
      stopListening();
    };
  }, [stopAllAudio, setIsRecording, stopListening]);

  const handleExit = async () => {
    const ok = await showConfirm(
      "Quit Sprint?", 
      "進行中のスプリントを終了して戻りますか？（スコアは記録されません）", 
      { variant: 'warning', isModal: false }
    );

    if (!ok) {
      return;
    }
    onExit?.();
  };


  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 overflow-hidden text-slate-900">
      <main className="bg-white border border-slate-100 w-full max-w-2xl h-full max-h-[95vh] rounded-[40px] flex flex-col relative overflow-hidden shadow-2xl">
        
        {/* ① 上部ヘッダー */}
        <div className="shrink-0 pt-6 w-full px-6">
          <div className="flex items-center justify-between h-12">
            <button 
              onClick={handleExit}
              className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200/80 active:scale-95 cursor-pointer transition-all"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>

            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-0.5">{contentName || 'Sprint Mode'}</span>
              <h1 className="text-sm font-black text-slate-800 tracking-tight text-center max-w-[200px] truncate">{courseTitle}</h1>
            </div>

            <div className={cn(
              "h-10 min-w-[85px] border rounded-xl flex items-center justify-center gap-2 px-3 transition-all duration-700",
              (isCritical && secondsLeft > 0) ? "bg-rose-50 border-rose-200 text-rose-600 shadow-[0_0_20px_rgba(225,29,72,0.1)]" :
              (isWarning && secondsLeft > 0) ? "bg-amber-50 border-amber-200 text-amber-600" :
              "bg-slate-50 border-slate-200 text-slate-700"
            )}>
              <Timer size={14} className={cn("transition-colors", isCritical ? "text-rose-500" : isWarning ? "text-amber-500" : "text-slate-400")} />
              <span className="text-sm font-black font-mono tracking-tight tabular-nums">
                {secondsLeft}s
              </span>
            </div>
          </div>

          <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
            <div 
              className={cn(
                "absolute top-0 left-0 h-full rounded-full transition-colors duration-700",
                isCritical ? "bg-rose-500" :
                isWarning ? "bg-amber-400" :
                "bg-indigo-600"
              )}
              style={{ 
                width: `${progressPercent}%`,
                transition: secondsLeft <= 0 ? 'width 0.2s ease-out' : 'width 1s linear'
              }}
            />
          </div>
        </div>

        {/* ② メイン垂直フレックスコンテナ */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto overscroll-contain">
          
          {/* ②-A: 問題番号・ステップ表示 */}
          <div className="w-full max-w-xl mx-auto flex flex-col gap-6 sm:gap-10 shrink-0 pb-4">
            <div className="flex items-center bg-indigo-600 rounded-[14px] shadow-sm overflow-hidden border border-indigo-600 self-start">
              <div className="flex items-center gap-2.5 px-3 py-1.5">
                <span className="text-[9px] font-black text-indigo-200 uppercase tracking-[0.2em] leading-none">Question</span>
                <span className="text-sm font-black text-white font-mono leading-none">
                  {isSpeedMode ? currentIndex + 1 : groupData.uniqueGroupIndex}
                </span>
              </div>

              {isSpeedMode ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-l border-indigo-600 self-stretch">
                  <span className="text-[10px] font-black tracking-tight text-slate-700">
                    {answerType === '1' ? 'NOで回答' : 'YESで回答'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-l border-indigo-600 self-stretch">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Step</span>
                  <span className="text-xs font-bold text-indigo-600 font-mono leading-none">
                    {groupData.currentInGroup + 1} <span className="text-slate-300 mx-0.5">/</span> {groupData.totalInGroup}
                  </span>
                </div>
              )}
            </div>

            <div className="w-full flex justify-center">
              <div className="w-full max-[280px] sm:w-72 flex items-center justify-between gap-2">
                {userActionSteps.map((step, idx) => {
                  const isCurrent = idx === currentActionIndex;
                  const isCompleted = idx < currentActionIndex;
                  return (
                    <div key={idx} className="flex-1 flex flex-col gap-1.5">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
                        <div 
                          className={cn(
                            "absolute inset-0 transition-transform duration-300",
                            isCompleted ? "bg-indigo-500" : isCurrent ? "bg-indigo-500" : "bg-transparent"
                          )}
                          style={{ transform: isCompleted || isCurrent ? 'translateX(0)' : 'translateX(-100%)' }}
                        />
                      </div>
                      <span className={cn(
                        "text-[10px] font-black tracking-tight",
                        isCurrent ? "text-indigo-600" : isCompleted ? "text-indigo-600" : "text-slate-300"
                      )}>
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ②-B: メッセージ ＋ 部分再生ボタンエリア */}
          <div className="flex-1 flex flex-col items-center justify-center space-y-10 py-4">
            <AnimatePresence mode="wait">
              {isRecording ? (
                <motion.div
                  key="recording-hud"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-10 w-full"
                >
                  <div className="flex items-center justify-center gap-4 w-full max-w-xl mx-auto px-4">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shrink-0 text-indigo-500">
                      <CircleDot className="w-full h-full" strokeWidth={2.5} />
                    </div>
                    <h2 className="text-lg sm:text-2xl font-black tracking-tight whitespace-nowrap select-none text-slate-800">
                      発話して回答しましょう
                    </h2>
                  </div>

                  <div className="flex flex-col items-center gap-6">
                    {(() => {
                      const RADIUS = 36;
                      const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
                      const MAX_TIME = 10;
                      const progress = Math.max(0, Math.min(timeLeft, MAX_TIME)) / MAX_TIME;
                      const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
                      return (
                        <div className="relative flex items-center justify-center w-24 h-24 select-none">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 92 92">
                            <circle cx="46" cy="46" r={RADIUS} className="stroke-rose-100" strokeWidth="5" fill="transparent" />
                            <motion.circle
                              cx="46"
                              cy="46"
                              r={RADIUS}
                              className="stroke-rose-500"
                              strokeWidth="5"
                              fill="transparent"
                              strokeDasharray={CIRCUMFERENCE}
                              animate={{ strokeDashoffset }}
                              transition={{
                                duration: timeLeft === MAX_TIME ? 0 : 1,
                                ease: "linear"
                              }}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-black font-mono text-rose-600 leading-none">
                              {timeLeft}
                            </span>
                            <div className="flex items-center gap-1 mt-0.5 text-rose-400">
                              <Mic size={10} fill="currentColor" className="animate-pulse" />
                              <span className="text-[9px] font-black uppercase tracking-wider leading-none">REC</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex flex-col items-center gap-3 mt-2">
                      <button
                        type="button"
                        onClick={handleStopRecord}
                        className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-rose-500 text-white hover:bg-rose-600 transition-all active:scale-[0.98] cursor-pointer shadow-sm w-48 group"
                        title="発話を完了して次へ"
                      >
                        <CheckCircle2 size={16} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-black tracking-wider">発話を完了</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSkipQuestion}
                        disabled={isSaving}
                        className="flex items-center justify-center gap-2 px-6 py-2 rounded-xl bg-transparent border border-transparent text-slate-400 hover:text-slate-600 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-20 disabled:pointer-events-none w-48"
                        title="この問題をスキップして次へ"
                      >
                        <FastForward size={14} strokeWidth={2.5} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">スキップする</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="status-message"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center justify-center gap-4 w-full max-w-xl mx-auto px-4"
                >
                  {audioPhase !== 'answer' && (
                    <div
                      className={cn(
                        "w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shrink-0 transition-colors duration-200",
                        audioPhase === 'idle' ? "text-slate-300" : "text-indigo-600"
                      )}
                    >
                      {audioPhase === 'idle' ? (
                        <CircleDot className="w-full h-full" strokeWidth={2.5} />
                      ) : (
                        <Headphones className="w-full h-full" strokeWidth={2.5} />
                      )}
                    </div>
                  )}

                  <h2 className="text-lg sm:text-2xl font-black text-slate-800 tracking-tight whitespace-nowrap select-none transition-colors duration-200">
                    {audioPhase === 'statement' && "基本文を再生中"}
                    {audioPhase === 'question' && (isQuestionBased ? "質問を再生中" : "指示文を再生中")}
                    {audioPhase === 'idle' && "Ready"}
                  </h2>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 統合された完了レイヤー */}
        {(isSaving || showTimeUpOverlay) && (
          <div 
            className="absolute inset-0 bg-white/95 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-in fade-in duration-300 cursor-pointer"
            onClick={showTimeUpOverlay ? handleGoToResult : undefined}
          >
            <div className="w-full max-w-xs text-center space-y-6 transform transition-all animate-in zoom-in-95 duration-300 ease-out">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100 shadow-sm text-indigo-600">
                {isSaving ? (
                  <Loader2 className="w-7 h-7 animate-spin" strokeWidth={2.5} />
                ) : (
                  <CheckCircle2 className="w-7 h-7 text-indigo-600" strokeWidth={2.2} />
                )}
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">
                  {isSaving ? "スプリントの記録を保存中" : "スプリント完了"}
                </h3>
                <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-[220px] mx-auto">
                  {isSaving 
                    ? "データを登録しています..." 
                    : "今回の成果を結果画面で確認しましょう。"}
                </p>
              </div>

              <div className={cn(
                "transition-all duration-500 transform",
                showTimeUpOverlay ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
              )}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGoToResult();
                  }}
                  className={cn(
                    "w-full h-12 rounded-xl font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 group cursor-pointer",
                    SHARED_BRAND_BUTTON
                  )}
                >
                  <span>結果を確認する</span>
                  <ArrowRight size={14} strokeWidth={2.5} className="group-hover:translate-x-0.5 transition-transform duration-200" />
                </button>
              </div>

            </div>
          </div>
        )}

      </main>
    </div>
  );
};