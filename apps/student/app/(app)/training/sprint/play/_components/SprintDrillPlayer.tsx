'use client';

import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { DRILL_TIMING, SprintQuestion } from "@gabby/types/sprint";
import { QuestionCard } from "./shared/QuestionCard";
import { SprintPlayControls } from "./shared/SprintPlayControls";
import { ChevronLeft, Loader2, Square, Volume2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useSprintStore } from '@/stores/useSprintStore';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { getSprintTitle } from '@gabby/lib';

interface SprintDrillPlayerProps {
  questions: SprintQuestion[];
  initialQuestionId?: string;
  initialStarted?: boolean; // ➕ 追加：親からの開始状態の上書き
  onExit?: () => void;
}

const DRILL_INSTRUCTIONS: Record<string, string> = {
  '0': "質問を聞き、「Yes」または「No」で回答してください。",
  '4': "指示に従って、聞こえてくる文章を変換してください。",
  '5': "語句を加えて、文法的に正しい文章を作ってください。",
  '6': "基本文の内容や関連する質問に回答してください。",
};

export const SprintDrillPlayer: React.FC<SprintDrillPlayerProps> = ({ 
  questions = [],
  initialQuestionId,
  initialStarted,
  onExit
}) => {
  const router = useRouter();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // ────────────────────────────────────────────────────────────
  // 🛡️ 修正ポイント：開始ステートの初期値を「栞からの再開か否か」で決定
  // ────────────────────────────────────────────────────────────
  // initialStarted が true の場合（SPA遷移など親でアクション済み）は即開始
  // initialQuestionId が無い(通常遷移) ＝ 選択画面でタップ済みなの、即時 true
  // initialQuestionId が有る(栞再開) ＝ 物理タップがないため、ウェルカム表示のために false に倒す
  const [isStarted, setIsStarted] = useState<boolean>(!!initialStarted || !initialQuestionId);

  const [audioPhase, setAudioPhase] = useState<'idle' | 'statement' | 'question' | 'answer'>('idle');
  // 🔌 Zustand ストア
  const {
    currentIndex,
    contentId,
    questionType,
    isRevealed,
    isAutoPlaying,
    isRecording,
    initSprint,
    nextStep,
    prevStep,
    setIsRevealed,
    setIsRecording,
    setPlayingQuestionSequence,
    setPlayingAnswerSequence,
    toggleAutoPlay,
    clearSession,
    resetStore
  } = useSprintStore();

  // 🔌 音声フック
  const { speak: ttsSpeak, setSpeechRate: ttsSetRate, startAssessment, stopListening, timeLeft } = useWebSpeech();
  const { playbackRate, changePlaybackRate } = usePlayAudioSpeech();

  const totalQuestions = questions?.length || 0;
  const currentQuestion = questions?.[currentIndex];

  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigating = useRef<boolean>(false);
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);
  const isInitialized = useRef<boolean>(false);

  const isAutoPlayingRef = useRef(isAutoPlaying);
  const isRevealedRef = useRef(isRevealed);
  
  useEffect(() => { isAutoPlayingRef.current = isAutoPlaying; }, [isAutoPlaying]);
  useEffect(() => { isRevealedRef.current = isRevealed; }, [isRevealed]);

  const courseTitle = useMemo(() => {
    return getSprintTitle(questionType || '0', Number(useSprintStore.getState().level));
  }, [questionType]);

  const instruction = useMemo(() => {
    return DRILL_INSTRUCTIONS[questionType || '0'] || "";
  }, [questionType]);

  const groupProgress = useMemo(() => {
    if (!currentQuestion || !questions.length) return { groupCurrentIndex: 0, groupTotalCount: 1 };
    const currentGroupId = currentQuestion.group_id;
    const groupQuestions = currentGroupId ? questions.filter(q => q.group_id === currentGroupId) : [currentQuestion];
    const groupCurrentIndex = groupQuestions.indexOf(currentQuestion);
    return { groupCurrentIndex: groupCurrentIndex >= 0 ? groupCurrentIndex : 0, groupTotalCount: groupQuestions.length };
  }, [currentQuestion, questions]);

  // 🔊 音声再生コアロジック
  const stopAllAudio = useCallback(() => {
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

  const playQuestionSequence = useCallback(async (question: SprintQuestion) => {
    if (!question) return;
    setPlayingQuestionSequence(true);
    if (question.statement) {
      setAudioPhase('statement');
      await playSingleTrack(question.statement, question.statement_voice);
      await new Promise(r => setTimeout(r, DRILL_TIMING.audioGap));
    }
    setAudioPhase('question');
    await playSingleTrack(question.question, question.question_voice);
    setAudioPhase('answer');
    setPlayingQuestionSequence(false);
  }, [playSingleTrack, setPlayingQuestionSequence]);

  const playAnswerSequence = useCallback(async (question: SprintQuestion) => {
    if (!question) return;
    setPlayingAnswerSequence(true);
    setAudioPhase('answer');
    await playSingleTrack(question.answer_sentence_yes, question.answer_sentence_yes_voice);
    if (question.answer_sentence_no) {
      await new Promise(r => setTimeout(r, 500));
      await playSingleTrack(question.answer_sentence_no, question.answer_sentence_no_voice);
    }
    setAudioPhase('idle');
    setPlayingAnswerSequence(false);
  }, [playSingleTrack, setPlayingAnswerSequence]);

  // 🎮 操作ハンドラー
  const handleReveal = useCallback(() => {
    if (!isStarted || !currentQuestion || isRevealed) return;
    stopAllAudio();
    setIsRevealed(true);
  }, [isStarted, currentQuestion, isRevealed, setIsRevealed, stopAllAudio]);

  const handleNext = useCallback(() => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    stopAllAudio();
    const { isLast } = nextStep();
    if (isLast) {
      showToast("すべてのドリルが完了しました！お疲れ様でした。", "success");
      onExit?.();
    }
    setTimeout(() => { isNavigating.current = false; }, 400);
  }, [stopAllAudio, nextStep, showToast, onExit]);

  const handlePrev = useCallback(() => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    stopAllAudio();
    prevStep();
    setTimeout(() => { isNavigating.current = false; }, 400);
  }, [stopAllAudio, prevStep]);

  const handleManualPlayAudio = useCallback(() => {
    if (isRecording || !currentQuestion) return;
    playQuestionSequence(currentQuestion);
  }, [currentQuestion, isRecording, playQuestionSequence]);

  const handleIndividualPlayAudio = useCallback((voiceUrl: string | null, text: string) => {
    if (isRecording || isAutoPlayingRef.current) return; 
    playSingleTrack(text, voiceUrl);
  }, [playSingleTrack, isRecording, isAutoPlayingRef]);

  const handleCycleRate = useCallback(() => {
    const rates = [1.0, 1.2, 1.5, 0.8];
    const targetIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    const targetRate = rates[targetIndex];
    changePlaybackRate(targetRate);
    ttsSetRate(targetRate);
  }, [playbackRate, changePlaybackRate, ttsSetRate]);

  const handleStartRecord = useCallback(() => {
    if (!currentQuestion) return;
    stopAllAudio();
    setIsRecording(true);
    const targetText = isRevealed ? currentQuestion.answer_sentence_yes : currentQuestion.question;
    const cleanWords = targetText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"").split(" ");
    startAssessment(targetText, cleanWords, (result) => { console.log(result.score); });
  }, [currentQuestion, isRevealed, stopAllAudio, setIsRecording, startAssessment]);

  const handleStopRecord = useCallback(() => {
    setIsRecording(false);
    stopListening();
  }, [setIsRecording, stopListening]);

  const forceRestartQuestionFlow = useCallback(() => {
    if (!currentQuestion) return;
    stopAllAudio();
    
    const runRestart = async () => {
      await playQuestionSequence(currentQuestion);
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

  // ⚙️ 5. リアクティブ・ライフサイクル
  
  // 🔌 初期注入
  useEffect(() => {
    let startIdx = 0;
    if (initialQuestionId && questions.length > 0) {
      const idx = questions.findIndex(q => q.question_id === initialQuestionId);
      if (idx >= 0) { 
        startIdx = idx; 
        if (!isInitialized.current) { 
          isInitialized.current = true; 
          showToast("続きから再開しました", "success"); 
        } 
      }
    }
    initSprint(questions, 'drill', startIdx);
    // プレイヤー終了時はセッションデータのみクリアし、設定（種別等）はストアに残す
    return () => clearSession();
  }, [questions, initialQuestionId, initSprint, clearSession, showToast]);

  // 🔄 タイムライン1：問題カード変更検知
  useEffect(() => {
    if (!currentQuestion || !isStarted) return;

    const runQuestionFlow = async () => {
      stopAllAudio();
      await playQuestionSequence(currentQuestion);
      
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
  }, [currentIndex, currentQuestion, playQuestionSequence, setIsRevealed, stopAllAudio, isStarted]);

  // 🔄 タイムライン2：解答オープン検知
  useEffect(() => {
    if (!isRevealed || !currentQuestion) return;

    const runAnswerFlow = async () => {
      await playAnswerSequence(currentQuestion);

      if (isAutoPlayingRef.current) {
        autoPlayTimerRef.current = setTimeout(() => {
          handleNext();
        }, DRILL_TIMING.nextCardDelay);
      }
    };

    runAnswerFlow();

    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [isRevealed, currentQuestion, playAnswerSequence, handleNext]);

  // フルスクリーン固定
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; stopAllAudio(); };
  }, [stopAllAudio]);

  // 🛡️ View 層：読み込みスケルトン
  if (!questions || totalQuestions === 0 || !currentQuestion) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl w-full max-w-md text-center space-y-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Preparing Questions</h2>
          <button onClick={() => router.back()} className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest">Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 overflow-hidden touch-none select-none">
      <main className="bg-white text-slate-900 shadow-2xl border border-slate-100 w-full max-w-2xl h-full max-h-[95vh] rounded-[40px] flex flex-col relative overflow-hidden">
        
        {/* ヘッダー */}
        <div className="shrink-0 pt-4 w-full px-4 border-b border-slate-50 pb-2">
          <div className="grid grid-cols-5 items-center min-h-[3rem] px-2">
            <div className="col-span-1 flex justify-start">
              <button onClick={() => onExit?.()} disabled={isAutoPlaying} className="h-9 w-9 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none">
                <ChevronLeft size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="col-span-3 flex flex-col items-center min-w-0">
              <div className="mb-1 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100/80">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none block whitespace-nowrap">Drill Mode</span>
              </div>
              <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none truncate w-full text-center">{courseTitle}</h1>
              <p className="text-[10px] font-bold text-slate-400 mt-1.5 tracking-tight">{instruction}</p>
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
              audioPhase={audioPhase}
            />
          </div>
        </div>

        {/* 🎮 下部：操作パネル */}
        <div className="px-6 pb-8 shrink-0 relative">
          <div className="w-full max-w-md mx-auto">
            <SprintPlayControls 
              onNext={handleNext}
              onPrev={handlePrev}
              onPlayAudio={handleManualPlayAudio}
              onStartRecord={handleStartRecord}
              onStopRecord={handleStopRecord}              
              onToggleAutoPlay={handleToggleAutoPlay}
              playbackRate={playbackRate}
              onChangePlaybackRate={handleCycleRate}
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

        {/* ──────────────────────────────────────────────────────────── */}
        {/* 🚀 🛡️ iOS/全OS共通：自動再生アンロック用ウェルカムオーバーレイ */}
        {/* ──────────────────────────────────────────────────────────── */}
        {!isStarted && (
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center p-4 z-[100] transition-all duration-300">
            <div className="bg-white p-8 rounded-[36px] shadow-2xl border border-slate-100 w-full max-w-sm text-center space-y-6 transform scale-100 transition-all duration-300">
              
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100 text-indigo-600 animate-pulse">
                <Volume2 size={26} strokeWidth={2.5} />
              </div>

              <div className="space-y-2">
                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.2em] bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                  Ready for Drill
                </span>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  {courseTitle}
                </h3>
                <p className="text-xs font-bold text-slate-500 leading-relaxed max-w-[250px] mx-auto">
                  このモードでは音声が自動再生されます。<br />
                  静かな環境、またはイヤホンを推奨します。
                </p>
              </div>

              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    const audio = new Audio();
                    audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
                    audio.play().catch(() => {});
                    window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
                  }
                  setIsStarted(true);
                }}
                className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
              >
                Start Drill Mode 🎯
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};