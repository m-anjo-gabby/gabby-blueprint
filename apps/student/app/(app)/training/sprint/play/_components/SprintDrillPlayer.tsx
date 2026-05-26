'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SprintQuestion } from "@gabby/types/sprint";
import { QuestionCard } from "./shared/QuestionCard";
import { SprintPlayControls } from "./shared/SprintPlayControls";
import { ChevronLeft, Loader2, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';

// 🔌 共有フック・アクションのインポート
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { saveResumeContent } from '@/actions/contentAction';
import { useResumeStore } from '@/stores/useResumeStore';
import { getSprintTitle } from '@gabby/lib';
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

  // ────────────────────────────────────────────────────────────
  // 🔌 1. 音声・評価用カスタムフックの初期化
  // ────────────────────────────────────────────────────────────
  const { 
    speak: ttsSpeak, 
    setSpeechRate: ttsSetRate, 
    startAssessment, 
    stopListening, 
    timeLeft, 
    isListening, 
    isSpeaking: isTtsSpeaking 
  } = useWebSpeech();

  const { 
    playbackRate, 
    changePlaybackRate, 
    isPlaying: filePlayingId 
  } = usePlayAudioSpeech();

  // 📦 状態管理 (State)
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (initialQuestionId && questions.length > 0) {
      const idx = questions.findIndex(q => q.question_id === initialQuestionId);
      if (idx >= 0) return idx;
    }
    return 0;
  });

  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isNativeAudioPlaying, setIsNativeAudioPlaying] = useState<boolean>(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false); 
  
  const totalQuestions = questions?.length || 0;
  const currentQuestion = questions?.[currentIndex];
  const isAudioPlaying = !!filePlayingId || isTtsSpeaking || isNativeAudioPlaying;

  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigating = useRef<boolean>(false);
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);

  // 🛡️ 二重初期化（トーストの二重発火）を防ぐためのガードフラグ
  const isInitialized = useRef<boolean>(false);

  const courseTitle = useMemo(() => {
    if (!currentQuestion) return "UG Sprint";
    return getSprintTitle(currentQuestion.question_type, currentQuestion.difficulty_level);
  }, [currentQuestion]);

  // ────────────────────────────────────────────────────────────
  // 📊 2. グループ内進捗計算ロジック
  // ────────────────────────────────────────────────────────────
  const groupProgress = useMemo(() => {
    if (!currentQuestion || !questions.length) {
      return { groupCurrentIndex: 0, groupTotalCount: 1 };
    }

    const currentGroupId = currentQuestion.group_id;
    const groupQuestions = questions.filter(q => q.group_id === currentGroupId);
    const groupCurrentIndex = groupQuestions.findIndex(q => q.question_id === currentQuestion.question_id);

    return {
      groupCurrentIndex: groupCurrentIndex >= 0 ? groupCurrentIndex : 0,
      groupTotalCount: groupQuestions.length
    };
  }, [currentQuestion, questions]);

  // ────────────────────────────────────────────────────────────
  // 🔊 3. ハイブリッド音声再生コアロジック
  // ────────────────────────────────────────────────────────────
  const stopAllAudio = useCallback(() => {
    if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    if (nativeAudioRef.current) {
      nativeAudioRef.current.pause();
      nativeAudioRef.current = null;
    }
    setIsNativeAudioPlaying(false);
    if (typeof window !== 'undefined') {
      window.speechSynthesis.cancel();
    }
  }, []);

  const playSingleTrack = useCallback((text: string, audioPath: string | null): Promise<void> => {
    return new Promise((resolve) => {
      stopAllAudio();

      if (audioPath) {
        const bucketUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${audioPath}`;
        const audio = new Audio(bucketUrl);
        audio.playbackRate = playbackRate;
        nativeAudioRef.current = audio;

        audio.onplay = () => setIsNativeAudioPlaying(true);
        audio.onended = () => {
          setIsNativeAudioPlaying(false);
          resolve();
        };
        audio.onerror = () => {
          setIsNativeAudioPlaying(false);
          console.warn(`Audio file failed to load: ${audioPath}. Falling back to TTS.`);
          ttsSpeak(text, playbackRate);
          const checkTtsEnd = setInterval(() => {
            if (!window.speechSynthesis.speaking) {
              clearInterval(checkTtsEnd);
              resolve();
            }
          }, 100);
        };
        
        audio.play().catch(() => {
          setIsNativeAudioPlaying(false);
          resolve();
        });
      } else {
        ttsSpeak(text, playbackRate);
        const checkTtsEnd = setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            clearInterval(checkTtsEnd);
            resolve();
          }
        }, 100);
      }
    });
  }, [playbackRate, ttsSpeak, stopAllAudio]);

  const playQuestionSequence = useCallback(async (question: SprintQuestion) => {
    if (!question) return;
    if (question.statement) {
      await playSingleTrack(question.statement, question.statement_voice);
    }
    await new Promise(r => setTimeout(r, 200));
    await playSingleTrack(question.question, question.question_voice);
  }, [playSingleTrack]);

  const handleIndividualPlayAudio = useCallback((voiceUrl: string | null, text: string) => {
    if (isRecording || isAutoPlaying) return; 
    playSingleTrack(text, voiceUrl);
  }, [playSingleTrack, isRecording, isAutoPlaying]);

  const handleCycleRate = useCallback(() => {
    const rates = [1.0, 1.2, 1.5, 0.8];
    const targetIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    const targetRate = rates[targetIndex];
    
    changePlaybackRate(targetRate);
    ttsSetRate(targetRate);
  }, [playbackRate, changePlaybackRate, ttsSetRate]);

  // ────────────────────────────────────────────────────────────
  // 🎮 4. 操作ハンドラー群
  // ────────────────────────────────────────────────────────────
  const handleReveal = useCallback(async () => {
    if (!currentQuestion) return;
    setIsRevealed(true);
    await playSingleTrack(currentQuestion.answer_sentence_yes, currentQuestion.answer_sentence_yes_voice);
  }, [currentQuestion, playSingleTrack]);

  const handleManualPlayAudio = useCallback(() => {
    if (isRecording || !currentQuestion) return;
    playQuestionSequence(currentQuestion);
  }, [currentQuestion, isRecording, playQuestionSequence]);

  const handleStartRecord = useCallback(() => {
    if (!currentQuestion) return;
    stopAllAudio();
    setIsRecording(true);
    
    const targetText = isRevealed ? currentQuestion.answer_sentence_yes : currentQuestion.question;
    const cleanWords = targetText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"").split(" ");
    
    startAssessment(targetText, cleanWords, (result) => {
      console.log("発音判定スコア:", result.score);
    });
  }, [currentQuestion, isRevealed, stopAllAudio, startAssessment]);

  const handleStopRecord = useCallback(() => {
    setIsRecording(false);
    stopListening();
  }, [stopListening]);

  const handleNext = useCallback(() => {
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    if (isNavigating.current) return;

    isNavigating.current = true;
    if (currentIndex < totalQuestions - 1) {
      stopAllAudio();
      setIsRevealed(false);
      setIsRecording(false);
      setCurrentIndex(prev => prev + 1);
    } else {
      showToast("すべてのドリルが完了しました！お疲れ様でした。", "success");
      router.back();
    }
    setTimeout(() => { isNavigating.current = false; }, 400);
  }, [currentIndex, totalQuestions, stopAllAudio, router, showToast]);

  const handlePrev = useCallback(() => {
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    if (isNavigating.current) return;

    isNavigating.current = true;
    if (currentIndex > 0) {
      stopAllAudio();
      setIsRevealed(false);
      setIsRecording(false);
      setCurrentIndex(prev => prev - 1);
    }
    setTimeout(() => { isNavigating.current = false; }, 400);
  }, [currentIndex, stopAllAudio]);

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
    } catch (e) {
      showToast("保存に失敗しました", "error");
    }
  }, [currentQuestion, currentIndex, totalQuestions, contentId, stopAllAudio, showConfirm, showToast, router]);

  const handleToggleAutoPlay = useCallback(async () => {
    if (!isAutoPlaying) {
      const ok = await showConfirm("Start Auto Play?", "自動再生を開始しますか？", { variant: 'info', isModal: false });
      if (!ok) return;
    }
    setIsAutoPlaying(prev => !prev);
  }, [isAutoPlaying, showConfirm]);

  // ────────────────────────────────────────────────────────────
  // ⚙️ 5. ライフサイクル & 自動再生タイマー制御
  // ────────────────────────────────────────────────────────────
  
  // 🛡️ 再開トースト発火エフェクト（単語帳と共通のRefガードを設置）
  useEffect(() => {
    if (isInitialized.current) return; // すでに初期化が走っていれば完全にブロックする

    if (initialQuestionId && questions.length > 0) {
      const idx = questions.findIndex(q => q.question_id === initialQuestionId);
      if (idx >= 0) {
        isInitialized.current = true; // 2回目が通らないように即座にロックを掛ける
        showToast("続きから再開しました", "success");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentQuestion) return;

    const startSequence = async () => {
      await new Promise(r => setTimeout(r, 400));
      await playQuestionSequence(currentQuestion);
      
      if (isAutoPlaying && !isRecording) {
        autoPlayTimerRef.current = setTimeout(() => {
          handleReveal();
        }, 2500);
      }
    };

    startSequence();

    return () => stopAllAudio();
  }, [currentIndex, currentQuestion, playQuestionSequence, stopAllAudio, isAutoPlaying, isRecording, handleReveal]);

  useEffect(() => {
    if (isRevealed && isAutoPlaying && !isAudioPlaying && !isRecording) {
      autoPlayTimerRef.current = setTimeout(() => {
        handleNext();
      }, 3500);
    }

    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [isRevealed, isAutoPlaying, isAudioPlaying, isRecording, handleNext]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
      stopAllAudio();
    };
  }, [stopAllAudio]);

  // ────────────────────────────────────────────────────────────
  // 🛡️ 6. 早期リターン
  // ────────────────────────────────────────────────────────────
  if (!questions || totalQuestions === 0 || !currentQuestion) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl w-full max-w-md text-center space-y-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Preparing Questions</h2>
          <button onClick={() => router.back()} className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const progress = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;
  const current = currentIndex + 1;

  // ────────────────────────────────────────────────────────────
  // 🎨 7. View 層
  // ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 overflow-hidden touch-none select-none">
      <main className="bg-white text-slate-900 shadow-2xl border border-slate-100 w-full max-w-2xl h-full max-h-[95vh] rounded-[40px] flex flex-col relative overflow-hidden">
        
        {/* 🔼 上部：同期ヘッダー */}
        <div className="shrink-0 pt-4 w-full overflow-hidden px-4">
          <div className="grid grid-cols-5 items-center h-12 px-2">
            <div className="col-span-1 flex justify-start">
              <button 
                onClick={() => router.back()} 
                disabled={isAutoPlaying} 
                className="h-9 w-9 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="col-span-3 flex flex-col items-center min-w-0">
              <div className="mb-1 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100/80">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none block whitespace-nowrap">Drill Mode</span>
              </div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none truncate w-full text-center">
                {courseTitle}
              </h1>
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
        <div className="flex-1 flex items-start justify-center p-6 pt-6 overflow-y-auto">
          <div className="w-full max-w-xl mx-auto">
            <QuestionCard 
              question={currentQuestion} 
              mode="drill"
              isRevealed={isRevealed} 
              onReveal={handleReveal}
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
              mode="drill"
              isRevealed={isRevealed}
              isRecording={isRecording}
              isAutoPlaying={isAutoPlaying}
              isFirstStep={currentIndex === 0}
              isLastStep={currentIndex === totalQuestions - 1}
              onReveal={handleReveal}
              onNext={handleNext}
              onPrev={handlePrev}
              onPlayAudio={handleManualPlayAudio}
              onStartRecord={handleStartRecord}
              onStopRecord={handleStopRecord}
              onSaveResume={handleSaveResume}
              onToggleAutoPlay={handleToggleAutoPlay}
              hasAudio={true}
              isPlaying={isAudioPlaying}
              playbackRate={playbackRate}
              onChangePlaybackRate={handleCycleRate}
              timeLeft={timeLeft}
            />
          </div>

          {/* 🛡️ 自動再生時の操作ロックオーバレイレイヤー */}
          {isAutoPlaying && (
            <div className="absolute inset-x-0 bottom-0 top-0 bg-white/10 backdrop-blur-[1px] flex flex-col items-center justify-center z-50">
              <button
                onClick={() => {
                  stopAllAudio();
                  setIsAutoPlaying(false);
                  showToast("自動再生を停止しました", "info");
                }}
                className="flex items-center gap-2 px-6 h-14 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl active:scale-95 transition-all border border-slate-800"
              >
                <Square size={12} fill="currentColor" />
                Stop Auto Play
              </button>
            </div>
          )}
        </div>

      </main>
    </div>
  );
};