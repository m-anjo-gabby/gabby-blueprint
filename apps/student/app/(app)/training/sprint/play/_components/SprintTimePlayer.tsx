'use client';

import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Volume2, Timer, CircleDot, ArrowRight, RotateCcw, Award, Hourglass } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { getSprintTitle } from '@gabby/lib';
import { SprintQuestion } from "@gabby/types/sprint";
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { useSprintStore } from '@/stores/useSprintStore';
import { createSprintScoreAction, SprintHistoryItem } from '@/actions/sprintAction';

interface SprintTimePlayerProps {
  questions: SprintQuestion[];
  onExit?: () => void;
}

const SPRINT_INSTRUCTIONS: Record<string, string> = {
  '0': "質問に対し、指定された回答タイプで即答してください。",
  '4': "指示に従って、瞬時に文章を変換してください。",
  '5': "指示された語句を組み込み、素早く回答してください。",
  '6': "質問に対し、完全な文章で素早く回答してください。",
};

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
    timeLimitSec,
    isAutoPlaying,
    initSprint,
    nextStep,
    toggleAutoPlay,
    clearSession,
    resetStore
  } = useSprintStore();

  // ────────────── 📦 ローカル管理ステート ──────────────
  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  const [audioPhase, setAudioPhase] = useState<'idle' | 'statement' | 'question' | 'thinking'>('idle');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [showTimeUpOverlay, setShowTimeUpOverlay] = useState<boolean>(false);

  // ────────────── 🔊 音声・タイマー参照 ──────────────
  const { speak: ttsSpeak, setSpeechRate: ttsSetRate } = useWebSpeech();
  const { playbackRate, changePlaybackRate } = usePlayAudioSpeech();

  const currentQuestion = questions?.[currentIndex];
  const totalQuestions = questions?.length || 0;

  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFlowRunningRef = useRef<boolean>(false);

  const courseTitle = useMemo(() => {
    return getSprintTitle(questionType || '0', Number(useSprintStore.getState().level));
  }, [questionType]);

  const instruction = useMemo(() => {
    if (questionType === '0') {
      return useSprintStore.getState().answerType === '1' ? "「No」で回答してください。" : "「Yes」で回答してください。";
    }
    return SPRINT_INSTRUCTIONS[questionType || '0'] || "";
  }, [questionType]);

  const isQuestionBased = questionType === '0' || questionType === '6';
  const questionLabelEN = isQuestionBased ? "Listen Question" : "Listen Instructions";
  const questionLabelJA = isQuestionBased ? "質問文再生中" : "指示文再生中";

  /**
   * 🗺️ タスク進行ステップの定義（QuestionCardと同期）
   */
  const userActionSteps = useMemo(() => {
    if (questionType === '0') return ["質問文", "回答"];
    const isQuestion = questionType === '6';
    return ["基本文", isQuestion ? "質問文" : "指示文", "回答"];
  }, [questionType]);

  const currentActionIndex = useMemo(() => {
    if (questionType === '0') {
      if (audioPhase === 'question') return 0;
      if (audioPhase === 'thinking') return 1;
      return 0;
    }
    if (audioPhase === 'statement') return 0;
    if (audioPhase === 'question') return 1;
    return 2;
  }, [audioPhase, questionType]);

  const groupData = useMemo(() => {
    if (!currentQuestion || !questions.length || questionType === '0') {
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
  }, [currentQuestion, questions, questionType]);

  const isTimeWarning = secondsLeft <= 30;

  const progressPercent = useMemo(() => {
    if (secondsLeft <= 0) return 0;
    return (secondsLeft / timeLimitSec) * 100;
  }, [secondsLeft, timeLimitSec]);

  const stopAllAudio = useCallback(() => {
    isFlowRunningRef.current = false;
    if (nativeAudioRef.current) {
      nativeAudioRef.current.pause();
      nativeAudioRef.current = null;
    }
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    setAudioPhase('idle');
  }, []);

  const handlePersistAndRedirect = useCallback(async (currentSecondsLeft: number) => {
    toggleAutoPlay(false);
    setIsSaving(true); 

    const { level, timeLimitSec: storeTimeLimit } = useSprintStore.getState();
    if (!questionType) {
      setIsSaving(false);
      onExit?.();
      return;
    }

    const answeredCount = currentSecondsLeft <= 0 ? currentIndex : Math.min(currentIndex + 1, questions.length);
    const slicedQuestions = questions.slice(0, answeredCount);

    const history: SprintHistoryItem[] = slicedQuestions.map((q) => ({
      question_id: q.question_id,
      group_id: q.group_id || null,
      seq_no: q.seq_no || 0,
    }));

    try {
      const res = await createSprintScoreAction({
        question_type: questionType,
        answer_type: answerType,
        difficulty_level: Number(level),
        time_limit_sec: storeTimeLimit,
        total_answered: answeredCount,
        history: history,
      });

      if (res.success && res.data) {
        if (currentSecondsLeft <= 0) {
          setResultId(res.data.self_sprint_id);
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
  }, [stopAllAudio, toggleAutoPlay, resetStore, router, showToast, onExit, currentIndex, questions, questionType]);

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

  const runSprintFlow = useCallback(async (question: SprintQuestion) => {
    if (!question || isFlowRunningRef.current) return;
    isFlowRunningRef.current = true;

    try {
      if (question.statement) {
        setAudioPhase('statement');
        await playTrack(question.statement, question.statement_voice);
        await new Promise(r => setTimeout(r, 400));
      }

      if (!isFlowRunningRef.current) return;

      setAudioPhase('question');
      await playTrack(question.question, question.question_voice);

      if (!isFlowRunningRef.current) return;

      setAudioPhase('thinking');
    } catch (e) {
      console.error("Sprint flow error:", e);
      setAudioPhase('thinking');
    } finally {
      isFlowRunningRef.current = false;
    }
  }, [playTrack]);

  const handlePlayIndividualPart = useCallback(async (type: 'statement' | 'question') => {
    if (!currentQuestion) return;
    stopAllAudio();
    isFlowRunningRef.current = true;

    try {
      if (type === 'statement' && currentQuestion.statement) {
        setAudioPhase('statement');
        await playTrack(currentQuestion.statement, currentQuestion.statement_voice);
      } else if (type === 'question') {
        setAudioPhase('question');
        await playTrack(currentQuestion.question, currentQuestion.question_voice);
      }
      setAudioPhase('thinking');
    } catch (e) {
      console.error("Individual play error:", e);
      setAudioPhase('thinking');
    } finally {
      isFlowRunningRef.current = false;
    }
  }, [currentQuestion, playTrack, stopAllAudio]);

  const handleReplayFromStart = useCallback(() => {
    if (!currentQuestion) return;
    stopAllAudio();
    runSprintFlow(currentQuestion);
  }, [currentQuestion, stopAllAudio, runSprintFlow]);

  const handleNextQuestion = useCallback(() => {
    const { isLast } = nextStep();
    if (isLast) {
      showToast("すべての問題を消化しました！スプリント完了です。", "success");
      handlePersistAndRedirect(secondsLeft);
    }
  }, [nextStep, showToast, handlePersistAndRedirect, secondsLeft]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isAutoPlaying && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isAutoPlaying, secondsLeft]);

  useEffect(() => {
    if (isAutoPlaying && secondsLeft <= 0) {
      isFlowRunningRef.current = false;
      showToast("Time up! スプリントセッションが終了しました。", "success");
      handlePersistAndRedirect(0);
    }
  }, [isAutoPlaying, secondsLeft, showToast, handlePersistAndRedirect]);

  useEffect(() => {
    initSprint(questions, 'sprint', 0);
    setSecondsLeft(timeLimitSec);
    toggleAutoPlay(true);
    return () => {
      clearSession();
    };
  }, [questions, initSprint, clearSession, toggleAutoPlay, timeLimitSec]);

  useEffect(() => {
    // タイムアップ画面の表示中や保存処理中、または残り時間が0の場合は音声を再生しない
    if (currentQuestion && secondsLeft > 0 && !showTimeUpOverlay && !isSaving) {
      stopAllAudio();
      (async () => {
        await runSprintFlow(currentQuestion);
      })();
    }
  }, [currentIndex, currentQuestion, runSprintFlow, stopAllAudio, showTimeUpOverlay, isSaving]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
      stopAllAudio();
    };
  }, [stopAllAudio]);

  const handleCycleRate = () => {
    const rates = [1.0, 1.2, 1.5, 0.8];
    const targetIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    const targetRate = rates[targetIndex];
    changePlaybackRate(targetRate);
    ttsSetRate(targetRate);
  };

  const handleExit = async () => {
    toggleAutoPlay(false);
    stopAllAudio();

    const ok = await showConfirm(
      "Quit Sprint?", 
      "進行中のスプリントを終了して戻りますか？（スコアは記録されません）", 
      { variant: 'warning', isModal: false }
    );

    if (!ok) {
      toggleAutoPlay(true);
      if (currentQuestion) runSprintFlow(currentQuestion);
      return;
    }
    onExit?.();
  };

  if (!questions || questions.length === 0 || !currentQuestion) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl w-full max-w-md text-center space-y-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Preparing Sprint</h2>
        </div>
      </div>
    );
  }

  const handleGoToResult = () => {
    if (resultId) {
      stopAllAudio();
      router.push(`/training/sprint/result/${resultId}`);
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 overflow-hidden touch-none select-none text-slate-900">
      <main className="bg-white border border-slate-100 w-full max-w-2xl h-full max-h-[95vh] rounded-[40px] flex flex-col relative overflow-hidden shadow-2xl">
        
        {/* ヘッダーエリア */}
        <div className="shrink-0 pt-6 w-full px-6">
          <div className="flex items-center justify-between h-12">
            <button 
              onClick={handleExit}
              className="h-10 px-4 flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200/80 active:scale-95 transition-all text-xs font-bold"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
              <span>終了</span>
            </button>

            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-0.5">Sprint Mode</span>
              <h1 className="text-sm font-black text-slate-800 tracking-tight text-center max-w-[200px] truncate">{courseTitle}</h1>
              <p className="text-[9px] font-bold text-slate-400 mt-1 tracking-tight">{instruction}</p>
            </div>

            {/* ⏱️ タイマー：0秒でブリンク停止。揺れのないパルスアニメーションを採用 */}
            <div className={cn(
              "h-10 min-w-[85px] border rounded-xl flex items-center justify-center gap-2 px-3 transition-all duration-500",
              (isTimeWarning && secondsLeft > 0)
                ? 'bg-rose-50 border-rose-200 text-rose-600 shadow-[0_0_15px_rgba(225,29,72,0.05)] animate-pulse' 
                : 'bg-slate-50 border-slate-200 text-slate-700'
            )}>
              <Timer size={14} className={cn("transition-colors", (isTimeWarning && secondsLeft > 0) ? "text-rose-500" : "text-slate-400")} />
              <span className="text-sm font-black font-mono tracking-tight tabular-nums">
                {secondsLeft}s
              </span>
            </div>
          </div>

          <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
            <div 
              className={`absolute top-0 left-0 h-full rounded-full ${
                isTimeWarning 
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500' 
                  : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
              }`}
              style={{ 
                width: `${progressPercent}%`,
                transition: secondsLeft <= 0 ? 'width 0.2s ease-out' : 'width 1s linear'
              }}
            />
          </div>
        </div>

        {/* メインコンテンツエリア */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8">
          
          {/* 🏆 ヘッダー情報の集約（左上にバッジ、中央にプログレスバー） */}
          <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
            {/* 問題番号バッジ：左上に配置してバランスを改善 */}
            <div className="flex items-center bg-indigo-600 rounded-[14px] shadow-sm overflow-hidden border border-indigo-600 self-start">
              <div className="flex items-center gap-2.5 px-3 py-1.5">
                <span className="text-[9px] font-black text-indigo-200 uppercase tracking-[0.2em] leading-none">Question</span>
                <span className="text-sm font-black text-white font-mono leading-none">
                  {questionType === '0' ? currentIndex + 1 : groupData.uniqueGroupIndex}
                </span>
              </div>
              {questionType !== '0' && (
                 <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-l border-indigo-600 self-stretch">
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Step</span>
                   <span className="text-xs font-bold text-indigo-600 font-mono leading-none">
                     {groupData.currentInGroup + 1} <span className="text-slate-300 mx-0.5">/</span> {groupData.totalInGroup}
                   </span>
                 </div>
              )}
            </div>

            {/* 🎯 タスク進行バー（日本語ラベル ＆ 中央配置） */}
            <div className="w-full flex justify-center">
              <div className="w-64 flex items-center justify-between gap-1.5">
                {userActionSteps.map((step, idx) => {
                  const isCurrent = idx === currentActionIndex;
                  const isCompleted = idx < currentActionIndex;
                  return (
                    <div key={idx} className="flex-1 flex flex-col gap-1.5">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
                        <div 
                          className={cn(
                            "absolute inset-0 transition-transform duration-300",
                            isCompleted ? "bg-emerald-500" : isCurrent ? "bg-indigo-500" : "bg-transparent"
                          )}
                          style={{ transform: isCompleted || isCurrent ? 'translateX(0)' : 'translateX(-100%)' }}
                        />
                      </div>
                      <span className={cn(
                        "text-[10px] font-black tracking-tight",
                        isCurrent ? "text-indigo-600" : isCompleted ? "text-emerald-600" : "text-slate-300"
                      )}>
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="w-full flex flex-col items-center space-y-6">
            
            <div className="relative w-36 h-36 flex items-center justify-center">
              {audioPhase !== 'idle' && audioPhase !== 'thinking' && (
                <>
                  <span className="animate-ping absolute inline-flex h-24 w-24 rounded-full bg-indigo-500/10 opacity-75"></span>
                  <span className="animate-pulse absolute inline-flex h-28 w-28 rounded-full bg-indigo-600/5 opacity-50"></span>
                </>
              )}
              {audioPhase === 'thinking' && (
                <span className="animate-ping absolute inline-flex h-24 w-24 rounded-full bg-emerald-500/10 opacity-60"></span>
              )}
              
              <div className={`w-28 h-28 rounded-[32px] flex items-center justify-center border transition-all duration-300 shadow-md ${
                audioPhase === 'statement' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' :
                audioPhase === 'question' ? 'bg-indigo-600 border-indigo-600 text-white' :
                audioPhase === 'thinking' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                {audioPhase === 'thinking' ? (
                  <CircleDot size={36} className="animate-pulse" />
                ) : (
                  <Volume2 size={36} strokeWidth={2.5} className={audioPhase !== 'idle' ? "animate-bounce" : ""} />
                )}
              </div>
            </div>

            <div className="space-y-4 min-h-[120px] flex flex-col items-center justify-start">
              <div className="space-y-1">
                <h2 className={cn(
                  "text-xl font-black tracking-tight transition-colors duration-200",
                  audioPhase === 'thinking' ? "text-emerald-600" : "text-slate-800"
                )}>
                  {audioPhase === 'statement' && "基本文"}
                  {audioPhase === 'question' && (isQuestionBased ? "質問文" : "指示文")}
                  {audioPhase === 'thinking' && "Time to Speak!"}
                  {audioPhase === 'idle' && "Ready..."}
                </h2>
                <p className="text-xs font-bold text-slate-400 max-w-[280px] mx-auto leading-relaxed transition-colors duration-200">
                  {audioPhase === 'statement' && "基本文再生中"}
                  {audioPhase === 'question' && questionLabelJA}
                  {audioPhase === 'thinking' && "声に出して即答してください！"}
                  {audioPhase === 'idle' && "音声ロード中..."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 w-full max-w-xs pt-2">
              <button
                onClick={() => handlePlayIndividualPart('statement')}
                disabled={!currentQuestion.statement}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-95 shadow-sm disabled:opacity-20 disabled:pointer-events-none"
              >
                <Volume2 size={12} className="text-indigo-500" />
                <span>基本文のみ</span>
              </button>
              
              <button
                onClick={() => handlePlayIndividualPart('question')}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
              >
                <Volume2 size={12} className="text-indigo-500" />
                <span>{isQuestionBased ? "質問のみ" : "指示のみ"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* コントロールエリア */}
        <div className="px-6 pb-10 shrink-0 border-t border-slate-100 bg-white">
          <div className="w-full max-w-md mx-auto pt-6 flex items-center gap-3">
            <button
              onClick={handleCycleRate}
              className="h-14 w-14 shrink-0 rounded-2xl bg-slate-50 text-xs font-black font-mono tracking-tight border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all active:scale-95"
              title="再生速度"
            >
              {playbackRate.toFixed(1)}x
            </button>

            <button
              onClick={handleNextQuestion}
              className="flex-1 h-14 rounded-2xl bg-indigo-600 text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-[0.97] flex items-center justify-center gap-2"
            >
              <span>Next</span>
              <ArrowRight size={16} strokeWidth={3} />
            </button>

            <button
              onClick={handleReplayFromStart}
              className="h-14 w-14 shrink-0 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center"
              title="最初から再生"
            >
              <RotateCcw size={16} strokeWidth={2.5} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* ────────────── Overlays ────────────── */}

        {/* ⏳ 保存中オーバーレイ */}
        {isSaving && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-fade-in">
            <div className="text-center space-y-4">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Saving Results...</p>
            </div>
          </div>
        )}

        {/* タイムアップ表示オーバーレイ */}
        {showTimeUpOverlay && (
          <div 
            className="absolute inset-0 bg-slate-950/10 backdrop-blur-[2px] flex items-center justify-center p-6 z-[60] transition-all animate-in fade-in duration-500 cursor-pointer"
            onClick={handleGoToResult}
          >
            <div 
              className="bg-white rounded-[48px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] border border-white/50 w-full max-w-xs text-center overflow-hidden transform transition-all animate-in zoom-in-95 duration-500 ease-out cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 上部バーを上品なインディゴ〜スレートのグラデーションにしてボタンと統一 */}
              <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-slate-400 to-indigo-500" />
              
              <div className="p-8 sm:p-10 space-y-6">
                
                {/* アイコンエリアをニュートラルで洗練されたトーンに。砂時計に「少しだけインディゴ」を混ぜる */}
                <div className="relative w-20 h-20 bg-gradient-to-b from-slate-50 to-slate-100/50 rounded-2xl flex items-center justify-center mx-auto border border-slate-200/60 shadow-sm text-slate-700">
                  <Hourglass size={32} strokeWidth={1.8} className="relative z-10 text-slate-600 animate-[spin_4s_infinite_ease-in-out]" />
                  {/* 微細なグロー効果 */}
                  <div className="absolute inset-0 bg-indigo-500/5 blur-xl rounded-full" />
                </div>

                <div className="space-y-2">
                  {/* バッジを「終了」を表すシックなモノトーン（ダークスレート）へ変更 */}
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-[0.25em] bg-slate-100 px-3 py-1 rounded-full border border-slate-200/60 inline-block">
                    Sprint Finished
                  </span>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-[200px] mx-auto">
                    今回の成果を確認しましょう。
                  </p>
                </div>

                {/* ボタンのフォントをさらにモダンに、シャドウも最適化 */}
                <button
                  onClick={handleGoToResult}
                  className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm tracking-wider shadow-[0_12px_20px_-6px_rgba(79,70,229,0.3)] hover:shadow-[0_16px_24px_-4px_rgba(79,70,229,0.4)] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2.5 group"
                >
                  <span>結果を確認する</span>
                  <ArrowRight size={16} strokeWidth={2.5} className="group-hover:translate-x-0.5 transition-transform duration-200" />
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};