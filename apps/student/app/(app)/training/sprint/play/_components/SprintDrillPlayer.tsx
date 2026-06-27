'use client';

import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { DRILL_TIMING, SprintQuestion, SprintQuestionType } from "@gabby/types/sprint";
import { QuestionCard } from "./QuestionCard";
import { SprintDrillPlayerControls } from "./SprintDrillPlayerControls";
import { SprintFeedback } from "./SprintFeedback";
import { ChevronLeft, Square } from 'lucide-react';

import { useSprintStore } from '@/stores/useSprintStore';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { getFeedbackConfig, getSprintTitle, playStartSound } from '@gabby/lib';
import { reportSprintProgress } from '@/actions/sprintAction';

interface SprintDrillPlayerProps {
  questions: SprintQuestion[];
  initialQuestionId?: string;
  initialStarted?: boolean;
  onExit?: () => void;
}

export const SprintDrillPlayer: React.FC<SprintDrillPlayerProps> = ({ 
  questions = [],
  initialQuestionId,
  initialStarted,
  onExit
}) => {
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const [isStarted, setIsStarted] = useState<boolean>(!!initialStarted || !initialQuestionId);
  const [audioPhase, setAudioPhase] = useState<'idle' | 'statement' | 'question' | 'answer'>('idle');

  // ────────────── 🔌 Zustand ストア ──────────────
  const {
    currentIndex,
    contentId,
    questionType,
    isRevealed,
    isAutoPlaying,
    isRecording,
    feedback,
    analysis,
    initSprint,
    nextStep,
    prevStep,
    setIsRevealed,
    setIsRecording,
    setPlayingQuestionSequence,
    setPlayingAnswerSequence,
    setFeedback,
    setAnalysis,
    drillEvalType,
    toggleAutoPlay
  } = useSprintStore();

  // ────────────── 🔊 音声・発話カスタムフック ──────────────
  const { speak: ttsSpeak, setSpeechRate: ttsSetRate, startAssessment, stopListening, timeLeft } = useWebSpeech();
  const { playbackRate, changePlaybackRate } = usePlayAudioSpeech();

  const totalQuestions = questions?.length || 0;
  const currentQuestion = questions?.[currentIndex];

  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigating = useRef<boolean>(false);
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);
  const isInitialized = useRef<boolean>(false);

  // 💡 フロー管理用の一意のカウンターID
  const flowIdRef = useRef<number>(0);

  const isAutoPlayingRef = useRef(isAutoPlaying);
  const isRevealedRef = useRef(isRevealed);
  
  useEffect(() => { isAutoPlayingRef.current = isAutoPlaying; }, [isAutoPlaying]);
  useEffect(() => { isRevealedRef.current = isRevealed; }, [isRevealed]);

  const contentIdRef = useRef(contentId);
  useEffect(() => {
    contentIdRef.current = contentId;
  }, [contentId]);

  const questionTypeRef = useRef(questionType);
  useEffect(() => {
    questionTypeRef.current = questionType;
  }, [questionType]);

  /**
   * 手動同期関数
   */
  const syncProgressNow = useCallback(async () => {
    if (!contentIdRef.current) return;
    const { questionCount, assessmentCount } = useSprintStore.getState().clearPendingCounts();
    if (questionCount > 0 || assessmentCount > 0) {
      await reportSprintProgress(
        contentIdRef.current,
        questionCount,
        assessmentCount,
        (questionTypeRef.current || '0') as SprintQuestionType
      );
    }
  }, []);

  /**
   * 5分ごとの定期自動保存
   */
  useEffect(() => {
    const FIVE_MINUTES = 5 * 60 * 1000;
    const intervalId = setInterval(() => {
      syncProgressNow();
    }, FIVE_MINUTES);
    return () => clearInterval(intervalId);
  }, [syncProgressNow]);

  const courseTitle = useMemo(() => {
    return getSprintTitle(questionType || '0', Number(useSprintStore.getState().level));
  }, [questionType]);

  const groupProgress = useMemo(() => {
    if (!currentQuestion || !questions.length) return { groupCurrentIndex: 0, groupTotalCount: 1 };
    const currentGroupId = currentQuestion.group_id;
    const groupQuestions = currentGroupId ? questions.filter(q => q.group_id === currentGroupId) : [currentQuestion];
    const groupCurrentIndex = groupQuestions.indexOf(currentQuestion);
    return { groupCurrentIndex: groupCurrentIndex >= 0 ? groupCurrentIndex : 0, groupTotalCount: groupQuestions.length };
  }, [currentQuestion, questions]);

  // 🔊 音声再生コアロジック
  // 💡 古い非同期 Promise の完了割り込みを防ぐため、常にカウンターを進めて全体をリセットする
  const stopAllAudio = useCallback(() => {
    flowIdRef.current += 1; 
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    if (nativeAudioRef.current) { nativeAudioRef.current.pause(); nativeAudioRef.current = null; }
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    setPlayingQuestionSequence(false);
    setPlayingAnswerSequence(false);
    setAudioPhase('idle');
  }, [setPlayingQuestionSequence, setPlayingAnswerSequence]);

  const playSingleTrack = useCallback((text: string, audioPath: string | null): Promise<void> => {
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

  // 💡 一意の currentFlowId を受け取り、非同期 await の直後に厳密にチェックを行う
  const playQuestionSequence = useCallback(async (question: SprintQuestion, currentFlowId: number) => {
    if (!question) return;
    setPlayingQuestionSequence(true);
    
    try {
      if (question.statement_en) {
        setAudioPhase('statement');
        await playSingleTrack(question.statement_en, question.statement_voice);
        if (flowIdRef.current !== currentFlowId) return; // 割り込み時は即座に処理を中断
        await new Promise(r => setTimeout(r, DRILL_TIMING.audioGap));
        if (flowIdRef.current !== currentFlowId) return;
      }
      
      setAudioPhase('question');
      if (question.question_en) {
        await playSingleTrack(question.question_en, question.question_voice);
        if (flowIdRef.current !== currentFlowId) return;
      }
      
      setAudioPhase('answer');
    } catch (e) {
      console.error("Question sequence error:", e);
    } finally {
      if (flowIdRef.current === currentFlowId) {
        setPlayingQuestionSequence(false);
      }
    }
  }, [playSingleTrack, setPlayingQuestionSequence]);

  // 💡 解答フェーズ用の一意の currentFlowId 追従ロジック
  const playAnswerSequence = useCallback(async (question: SprintQuestion, currentFlowId: number) => {
    if (!question) return;
    setPlayingAnswerSequence(true);
    setAudioPhase('answer');
    
    try {
      if (question.answer_sentence_yes_en) {
        await playSingleTrack(question.answer_sentence_yes_en, question.answer_sentence_yes_voice);
        if (flowIdRef.current !== currentFlowId) return;
      }
      if (question.answer_sentence_no_en) {
        await new Promise(r => setTimeout(r, 500));
        if (flowIdRef.current !== currentFlowId) return;
        await playSingleTrack(question.answer_sentence_no_en, question.answer_sentence_no_voice);
        if (flowIdRef.current !== currentFlowId) return;
      }
      
      setAudioPhase('idle');
    } catch (e) {
      console.error("Answer sequence error:", e);
    } finally {
      if (flowIdRef.current === currentFlowId) {
        setPlayingAnswerSequence(false);
      }
    }
  }, [playSingleTrack, setPlayingAnswerSequence]);

  // 🎮 操作ハンドラー
  const handleReveal = useCallback(() => {
    if (!isStarted || !currentQuestion || isRevealed) return;
    stopAllAudio();
    setIsRevealed(true);
  }, [isStarted, currentQuestion, isRevealed, setIsRevealed, stopAllAudio]);

  const handleNext = useCallback(async () => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    stopAllAudio();
    
    const { isLast } = nextStep();
    if (isLast) {
      toggleAutoPlay(false); // 安全のため自動再生をオフに
      showToast("すべてのドリルが完了しました！お疲れ様でした。", "success");
      try {
        await syncProgressNow();
      } catch (e) {
        console.error(e);
      }
      onExit?.();
    }
    setTimeout(() => { isNavigating.current = false; }, 400);
  }, [stopAllAudio, nextStep, toggleAutoPlay, showToast, onExit, syncProgressNow]);

  const handleNextRef = useRef(handleNext);
  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  const handlePrev = useCallback(() => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    stopAllAudio();
    prevStep();
    setTimeout(() => { isNavigating.current = false; }, 400);
  }, [stopAllAudio, prevStep]);

  const handleManualPlayAudio = useCallback(() => {
    if (isRecording || !currentQuestion) return;
    stopAllAudio();
    playQuestionSequence(currentQuestion, flowIdRef.current);
  }, [currentQuestion, isRecording, playQuestionSequence, stopAllAudio]);

  const handleIndividualPlayAudio = useCallback((voiceUrl: string | null, text: string) => {
    if (isRecording || isAutoPlayingRef.current) return; 
    playSingleTrack(text, voiceUrl);
  }, [playSingleTrack, isRecording, isAutoPlayingRef]);

  const handleSelectRate = useCallback((targetRate: number) => {
    changePlaybackRate(targetRate);
    ttsSetRate(targetRate);
  }, [changePlaybackRate, ttsSetRate]);

  const handleStartRecord = useCallback(() => {
    if (!currentQuestion) return;
    playStartSound();
    stopAllAudio();
    setFeedback(null);
    setAnalysis(null);
    setIsRecording(true);
    
    const targetText = (questionType === '0')
      ? (drillEvalType === 'no' ? (currentQuestion.answer_sentence_no_en ?? "") : currentQuestion.answer_sentence_yes_en)
      : currentQuestion.answer_sentence_yes_en;

    if (!targetText) {
      setIsRecording(false);
      return;
    }

    const cleanWords = targetText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"").split(" ").filter(Boolean);

    startAssessment(targetText, cleanWords, (result) => {
      setAnalysis(result);
      setFeedback(getFeedbackConfig(result.score));
      setIsRecording(false);
      setIsRevealed(true);
      useSprintStore.getState().incrementAssessmentCount();
    });
  }, [currentQuestion, questionType, drillEvalType, stopAllAudio, setIsRecording, startAssessment, setFeedback, setAnalysis, setIsRevealed]);

  const handleStopRecord = useCallback(() => {
    setIsRecording(false);
    stopListening();
  }, [setIsRecording, stopListening]);

  const forceRestartQuestionFlow = useCallback(() => {
    if (!currentQuestion) return;
    stopAllAudio();
    
    const currentFlowId = flowIdRef.current;
    const runRestart = async () => {
      await playQuestionSequence(currentQuestion, currentFlowId);
      if (flowIdRef.current !== currentFlowId) return;

      if (isAutoPlayingRef.current && !isRevealedRef.current) {
        autoPlayTimerRef.current = setTimeout(() => {
          setIsRevealed(true);
        }, DRILL_TIMING.thinkingTime);
      }
    };
    runRestart();
  }, [currentQuestion, playQuestionSequence, setIsRevealed, stopAllAudio]);

  const handleToggleAutoPlay = useCallback(async () => {
    if (!isAutoPlaying) {
      const ok = await showConfirm("Start Auto Play?", "自動再生を開始しますか？", { variant: 'info', isModal: false });
      if (!ok) return;
      
      toggleAutoPlay(true);
      forceRestartQuestionFlow();
    } else {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      toggleAutoPlay(false);
    }
  }, [isAutoPlaying, showConfirm, toggleAutoPlay, forceRestartQuestionFlow]);

  // 初期注入と先行同期
  useEffect(() => {
    let startIdx = 0;
    let shouldSync = false;

    if (!isInitialized.current) {
      isInitialized.current = true;
      shouldSync = true;
    }

    if (initialQuestionId && questions.length > 0) {
      const idx = questions.findIndex(q => q.question_id === initialQuestionId);
      if (idx >= 0) { 
        startIdx = idx; 
        if (shouldSync) { 
          showToast("続きから再開しました", "success"); 
        } 
      }
    }

    initSprint(questions, 'drill', startIdx);

    if (shouldSync) {
      useSprintStore.setState((state) => ({
        pendingQuestionCount: state.pendingQuestionCount + 1
      }));
      syncProgressNow();
    }
  }, [questions, initialQuestionId, initSprint, showToast, syncProgressNow]);

  const handleExitWithSync = async () => {
    if (isAutoPlaying) return;

    const ok = await showConfirm("トレーニングを終了しますか？", "前の画面に戻ります。", { 
      variant: 'info', 
      isModal: false 
    });
    if (!ok) return;

    try {
      await syncProgressNow();
    } catch (e) {
      console.error(e);
    }
    onExit?.();
  };

  // タイムライン1：問題カード変更検知
  useEffect(() => {
    if (!currentQuestion || !isStarted) return;

    stopAllAudio();
    const currentFlowId = flowIdRef.current;

    const runQuestionFlow = async () => {
      await playQuestionSequence(currentQuestion, currentFlowId);
      if (flowIdRef.current !== currentFlowId) return;
      
      if (isAutoPlayingRef.current && !isRevealedRef.current) {
        autoPlayTimerRef.current = setTimeout(() => {
          setIsRevealed(true);
        }, DRILL_TIMING.thinkingTime);
      }
    };

    runQuestionFlow();
    
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
    // ✨ 依存関係を厳密に制限。毎秒変わる state などによる再トリガーを防ぐ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentQuestion?.question_id, isStarted]);

  // タイムライン2：解答オープン検知
  useEffect(() => {
    if (!isRevealed || !currentQuestion) return;

    // 解答再生時は、現在の再生フローIDを引き継ぎ、二重再生にならないように管理
    const currentFlowId = flowIdRef.current;

    const runAnswerFlow = async () => {
      await playAnswerSequence(currentQuestion, currentFlowId);
      if (flowIdRef.current !== currentFlowId) return;

      if (isAutoPlayingRef.current) {
        autoPlayTimerRef.current = setTimeout(() => {
          handleNextRef.current();
        }, DRILL_TIMING.nextCardDelay);
      }
    };

    runAnswerFlow();

    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
    // ✨ 依存をインデックスとオープン状態に絞り、タイマー副作用から切り離し
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRevealed, currentIndex]);

  // フルスクリーン固定
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { 
      document.body.style.overflow = originalOverflow; 
      stopAllAudio(); 
    };
  }, [stopAllAudio]);


  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 overflow-hidden touch-none select-none">
      <main className="bg-white text-slate-900 shadow-2xl border border-slate-100 w-full max-w-2xl h-full max-h-[95vh] rounded-[40px] flex flex-col relative overflow-hidden">
        
        {/* ヘッダー */}
        <div className="shrink-0 pt-4 w-full px-4 border-b border-slate-50 pb-2">
          <div className="grid grid-cols-5 items-center min-h-[3rem] px-2">
            <div className="col-span-1 flex justify-start">
              <button onClick={handleExitWithSync} disabled={isAutoPlaying} className="h-9 w-9 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none">
                <ChevronLeft size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="col-span-3 flex flex-col items-center min-w-0">
              <div className="mb-1 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100/80">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none block whitespace-nowrap">Drill Mode</span>
              </div>
              <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none truncate w-full text-center">{courseTitle}</h1>
            </div>
            <div className="col-span-1" />
          </div>
        </div>

        {/* 🎴 中央：メイン教材カードセクション */}
        <div className="flex-1 flex items-start justify-center p-6 pt-6 overflow-y-auto" onClick={handleReveal}>
          <div className="w-full max-w-xl mx-auto">
            <QuestionCard 
              key={currentIndex}
              groupCurrentIndex={groupProgress.groupCurrentIndex}
              groupTotalCount={groupProgress.groupTotalCount}
              onPlayAudio={handleIndividualPlayAudio}
              onStartRecord={handleStartRecord}
              audioPhase={audioPhase}
              isRecording={isRecording}
              timeLeft={timeLeft}
            />
          </div>
        </div>

        {/* 🎮 下部：操作パネル */}
        <div className="px-6 pb-8 shrink-0 relative">
          <div className="w-full max-w-md mx-auto">
            <SprintDrillPlayerControls 
              onNext={handleNext}
              onPrev={handlePrev}
              onPlayAudio={handleManualPlayAudio}
              onStartRecord={handleStartRecord}
              onStopRecord={handleStopRecord}              
              onToggleAutoPlay={handleToggleAutoPlay}
              playbackRate={playbackRate}
              onChangePlaybackRate={handleSelectRate}
              timeLeft={timeLeft}
              isStarted={isStarted}
            />
          </div>

          {/* 自動再生ロックレイヤー */}
          {isAutoPlaying && (
            <div className="absolute inset-x-0 bottom-0 top-0 bg-white/10 backdrop-blur-[1px] flex flex-col items-center justify-center z-50">
              <button
                onClick={handleToggleAutoPlay}
                className="flex items-center gap-2 px-6 h-14 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl active:scale-95 transition-all border border-slate-800"
              >
                <Square size={12} fill="currentColor" />
                Stop Auto Play
              </button>
            </div>
          )}
        </div>

        {/* 発話フィードバックオーバーレイ */}
        <SprintFeedback 
          feedback={feedback} 
          analysis={analysis} 
          onClose={() => setFeedback(null)} 
        />

      </main>
    </div>
  );
};