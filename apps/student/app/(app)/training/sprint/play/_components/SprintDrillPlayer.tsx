'use client';

import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { SprintQuestion } from "@gabby/types/sprint";
import { QuestionCard } from "./shared/QuestionCard";
import { SprintPlayControls } from "./shared/SprintPlayControls";
import { ChevronLeft, Loader2, Square, Volume2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useSprintStore } from '@/stores/useSprintStore';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { saveResumeContent } from '@/actions/contentAction';
import { useResumeStore } from '@/stores/useResumeStore';
import { DRILL_TIMING, getSprintTitle } from '@gabby/lib';
import { SprintResumeMetadata } from '@gabby/types/training';

interface SprintDrillPlayerProps {
  questions: SprintQuestion[];
  contentId: string;
  initialQuestionId?: string;
}

export const SprintDrillPlayer: React.FC<SprintDrillPlayerProps> = ({ 
  questions = [], 
  contentId, 
  initialQuestionId 
}) => {
  const router = useRouter();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // 🛡️ iOS/全ブラウザの自動再生ポリシーをクリーンに突破するための開始フラグ
  const [isStarted, setIsStarted] = useState<boolean>(false);

  // ────────────────────────────────────────────────────────────
  // 🔌 1. Zustand ストアから状態とアクションの抽出
  // ────────────────────────────────────────────────────────────
  const {
    currentIndex,
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
    resetStore
  } = useSprintStore();

  // ────────────────────────────────────────────────────────────
  // 🔌 2. 音声フックの初期化
  // ────────────────────────────────────────────────────────────
  const { speak: ttsSpeak, setSpeechRate: ttsSetRate, startAssessment, stopListening, timeLeft } = useWebSpeech();
  const { playbackRate, changePlaybackRate } = usePlayAudioSpeech();

  const totalQuestions = questions?.length || 0;
  const currentQuestion = questions?.[currentIndex];

  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigating = useRef<boolean>(false);
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);
  const isInitialized = useRef<boolean>(false);

  // 💡 useEffectが不要に再実行されるのを防ぐため、状態をRefに同期
  const isAutoPlayingRef = useRef(isAutoPlaying);
  const isRevealedRef = useRef(isRevealed);
  
  useEffect(() => { isAutoPlayingRef.current = isAutoPlaying; }, [isAutoPlaying]);
  useEffect(() => { isRevealedRef.current = isRevealed; }, [isRevealed]);

  const courseTitle = useMemo(() => {
    if (!currentQuestion) return "UG Sprint";
    return getSprintTitle(currentQuestion.question_type, currentQuestion.difficulty_level);
  }, [currentQuestion]);

  const groupProgress = useMemo(() => {
    if (!currentQuestion || !questions.length) return { groupCurrentIndex: 0, groupTotalCount: 1 };
    const currentGroupId = currentQuestion.group_id;
    const groupQuestions = questions.filter(q => q.group_id === currentGroupId);
    const groupCurrentIndex = groupQuestions.findIndex(q => q.question_id === currentQuestion.question_id);
    return { groupCurrentIndex: groupCurrentIndex >= 0 ? groupCurrentIndex : 0, groupTotalCount: groupQuestions.length };
  }, [currentQuestion, questions]);

  // ────────────────────────────────────────────────────────────
  // 🔊 3. 音声再生コアロジック
  // ────────────────────────────────────────────────────────────
  const stopAllAudio = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    if (nativeAudioRef.current) { nativeAudioRef.current.pause(); nativeAudioRef.current = null; }
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    setPlayingQuestionSequence(false);
    setPlayingAnswerSequence(false);
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
      await playSingleTrack(question.statement, question.statement_voice);
      await new Promise(r => setTimeout(r, DRILL_TIMING.audioGap));
    }
    await playSingleTrack(question.question, question.question_voice);
    setPlayingQuestionSequence(false);
  }, [playSingleTrack, setPlayingQuestionSequence]);

  const playAnswerSequence = useCallback(async (question: SprintQuestion) => {
    if (!question) return;
    setPlayingAnswerSequence(true);
    await playSingleTrack(question.answer_sentence_yes, question.answer_sentence_yes_voice);
    if (question.answer_sentence_no) {
      await new Promise(r => setTimeout(r, 500));
      await playSingleTrack(question.answer_sentence_no, question.answer_sentence_no_voice);
    }
    setPlayingAnswerSequence(false);
  }, [playSingleTrack, setPlayingAnswerSequence]);

  // ────────────────────────────────────────────────────────────
  // 🎮 4. 操作ハンドラー
  // ────────────────────────────────────────────────────────────
  const handleReveal = useCallback(() => {
    // 🛡️ ウェルカム画面が表示されている間は背後のカードタップイベントを無効化
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
      router.back();
    }
    setTimeout(() => { isNavigating.current = false; }, 400);
  }, [stopAllAudio, nextStep, showToast, router]);

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

  const handleSaveResume = useCallback(async () => {
    if (!currentQuestion || totalQuestions === 0) return;
    const ok = await showConfirm("Bookmark?", "進捗を保存して戻りますか？", { variant: 'warning', isModal: false });
    if (!ok) return;
    stopAllAudio();
    const metadata: SprintResumeMetadata = {
      type: 'sprint_drill',
      question_id: currentQuestion.question_id,
      last_index: currentIndex,
      display: {
        progress_percent: Math.round(((currentIndex + 1) / totalQuestions) * 100),
        position_text: `Card ${currentIndex + 1} / ${totalQuestions}`,
        last_unit_name: currentQuestion.question.slice(0, 20) + "..."
      }
    };
    try {
      await saveResumeContent(contentId, currentQuestion.question_id, metadata);
      await useResumeStore.getState().fetchResume(true);
      showToast("ブックマークしました", "success");
      router.push('/dashboard');
    } catch {
      showToast("保存に失敗しました", "error");
    }
  }, [currentQuestion, currentIndex, totalQuestions, contentId, stopAllAudio, showConfirm, showToast, router]);

  // ────────────────────────────────────────────────────────────
  // ⚙️ 5. リアクティブ・ライフサイクル（タイムラインの完全分離）
  // ────────────────────────────────────────────────────────────
  
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
    return () => resetStore();
  }, [questions, initialQuestionId, initSprint, resetStore, showToast]);

  // 🔄 タイムライン1：純粋に問題（カード）が変わった瞬間、かつ「ユーザーが開始した」瞬間だけ発火
  useEffect(() => {
    // 🛡️ ユーザーがウェルカム画面のスタートを押すまでは音声を鳴らさない
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
  }, [currentIndex, currentQuestion, playQuestionSequence, setIsRevealed, stopAllAudio, isStarted]); // 👈 isStarted を追加

  // 🔄 タイムライン2：解答がオープンされた瞬間だけ発火
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

  // ────────────────────────────────────────────────────────────
  // 🛡️ 6. View 層
  // ────────────────────────────────────────────────────────────
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

  const progress = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;
  const current = currentIndex + 1;

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 overflow-hidden touch-none select-none">
      <main className="bg-white text-slate-900 shadow-2xl border border-slate-100 w-full max-w-2xl h-full max-h-[95vh] rounded-[40px] flex flex-col relative overflow-hidden">
        
        {/* ヘッダー */}
        <div className="shrink-0 pt-4 w-full overflow-hidden px-4">
          <div className="grid grid-cols-5 items-center h-12 px-2">
            <div className="col-span-1 flex justify-start">
              <button onClick={() => router.back()} disabled={isAutoPlaying} className="h-9 w-9 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none">
                <ChevronLeft size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="col-span-3 flex flex-col items-center min-w-0">
              <div className="mb-1 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100/80">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none block whitespace-nowrap">Drill Mode</span>
              </div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none truncate w-full text-center">{courseTitle}</h1>
            </div>
            <div className="col-span-1" />
          </div>

          <div className="mt-2 px-6 pb-2">
            <div className="flex justify-between items-end mb-1.5 px-0.5">
              <div className="flex items-baseline gap-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Card</span>
                <span className="text-[11px] font-black text-indigo-600 ml-1 tabular-nums">{current}</span>
                <span className="text-[9px] font-bold text-slate-300">/</span>
                <span className="text-[10px] font-bold text-slate-400 tabular-nums">{totalQuestions}</span>
              </div>
              <span className="text-[10px] font-black text-slate-400 tabular-nums">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner relative">
              <div className="absolute top-0 left-0 h-full bg-indigo-600 transition-all duration-500 ease-out rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {/* 🎴 中央：メイン教材カードセクション */}
        <div className="flex-1 flex items-start justify-center p-6 pt-6 overflow-y-auto" onClick={handleReveal}>
          <div className="w-full max-w-xl mx-auto">
            <QuestionCard 
              groupCurrentIndex={groupProgress.groupCurrentIndex}
              groupTotalCount={groupProgress.groupTotalCount}
              onPlayAudio={handleIndividualPlayAudio}
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
              onSaveResume={handleSaveResume}
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
              
              {/* 美しいパルスアイコン演出 */}
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100 text-indigo-600 animate-pulse">
                <Volume2 size={26} strokeWidth={2.5} />
              </div>

              {/* 親切な案内メッセージ */}
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

              {/* 運命のアンロックトリガーボタン */}
              <button
                onClick={() => {
                  // 🔥 【重要】ユーザーの「物理的生タップ」のコールスタック内でブラウザのオーディオロックを完全解凍
                  if (typeof window !== 'undefined') {
                    // 1. Native Audio (HTMLAudioElement) の解凍用ダミー
                    const audio = new Audio();
                    audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='; // 1msの無音WAV
                    audio.play().catch(() => {});
                    
                    // 2. Web Speech API (TTS) の解凍用ダミー
                    window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
                  }

                  // 🚀 フラグを立てて、タイムライン1のエフェクトを安全に点火させる
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