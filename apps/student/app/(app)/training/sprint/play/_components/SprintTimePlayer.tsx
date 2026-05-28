'use client';

import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Volume2, Timer, CircleDot, ArrowRight, RotateCcw } from 'lucide-react';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { getSprintTitle } from '@gabby/lib';
import { SprintQuestion } from "@gabby/types/sprint";
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { useSprintStore } from '@/stores/useSprintStore';
import { createSprintScoreAction, SprintHistoryItem } from '@/actions/sprintAction'; // 🔥 サーバーアクションの直接結合

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
  const [isSaving, setIsSaving] = useState<boolean>(false); // 🔥 ストアに依存しない非同期保存用ローディング

  // ────────────── 🔊 音声・タイマー参照 ──────────────
  const { speak: ttsSpeak, setSpeechRate: ttsSetRate } = useWebSpeech();
  const { playbackRate, changePlaybackRate } = usePlayAudioSpeech();

  const currentQuestion = questions?.[currentIndex];
  const totalQuestions = questions?.length || 0;

  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFlowRunningRef = useRef<boolean>(false);

  // 📋 コースタイトルの取得
  const courseTitle = useMemo(() => {
    return getSprintTitle(questionType || '0', Number(useSprintStore.getState().level));
  }, [questionType]);

  // 🎯 質問ベースの種別判定（'0': Speed, '6': Mastery）
  const isQuestionBased = questionType === '0' || questionType === '6';

  // 📝 クエスチョンタイプに応じた文言出し分け
  const questionLabelEN = isQuestionBased ? "Listen Question" : "Listen Instructions";
  const questionLabelJA = isQuestionBased ? "質問文再生中" : "指示文再生中";

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

  // 🔊 音声ストップ
  const stopAllAudio = useCallback(() => {
    isFlowRunningRef.current = false;
    if (nativeAudioRef.current) {
      nativeAudioRef.current.pause();
      nativeAudioRef.current = null;
    }
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    setAudioPhase('idle');
  }, []);

  // 💾 🧪 【コアロジック】実績保存＆次ページへリダイレクト
  const handlePersistAndRedirect = useCallback(async (currentSecondsLeft: number) => {
    stopAllAudio();
    toggleAutoPlay(false);
    
    // 💡 多重送信を確実に防止するガードロック
    setIsSaving(true); 

    const { level, timeLimitSec: storeTimeLimit } = useSprintStore.getState();
    if (!questionType) {
      setIsSaving(false);
      onExit?.();
      return;
    }

    // ⚡ ユーザーがどこまで正確に進んだかを算出
    // タイムアップ(0秒)の場合はcurrentIndexまで、Next押し切り完了時は全問消化として処理
    const answeredCount = currentSecondsLeft <= 0 ? currentIndex : Math.min(currentIndex + 1, questions.length);
    const slicedQuestions = questions.slice(0, answeredCount);

    // 最新のJSON履歴オブジェクト配列を作成
    const history: SprintHistoryItem[] = slicedQuestions.map((q) => ({
      question_id: q.question_id,
      group_id: q.group_id || null,
      seq_no: q.seq_no || 0,
    }));

    try {
      // 🚀 サーバーアクションをストレートに実行
      const res = await createSprintScoreAction({
        question_type: questionType,
        answer_type: answerType,
        difficulty_level: Number(level),
        time_limit_sec: storeTimeLimit,
        total_answered: answeredCount,
        history: history,
      });

      if (res.success && res.data) {
        // プレイ用セッションストアを初期化して、結果画面へ遷移
        resetStore();
        router.push(`/training/sprint/result/${res.data.self_sprint_id}`);
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

  // 音声再生コア
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

  // 🏃‍♂️ スプリントフロー再生
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

  // 🎯 個別パーツ再生
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

  // 全体再生リスタート
  const handleReplayFromStart = useCallback(() => {
    if (!currentQuestion) return;
    stopAllAudio();
    runSprintFlow(currentQuestion);
  }, [currentQuestion, stopAllAudio, runSprintFlow]);

  // ⏭️ 次の問題へ
  const handleNextQuestion = useCallback(() => {
    const { isLast } = nextStep();
    
    if (isLast) {
      showToast("すべての問題を消化しました！スプリント完了です。", "success");
      handlePersistAndRedirect(secondsLeft);
    }
  }, [nextStep, showToast, handlePersistAndRedirect, secondsLeft]);

  // ⏱️ タイマーロジック
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isAutoPlaying && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isAutoPlaying, secondsLeft > 0]);

  // タイムアップ監視
  useEffect(() => {
    if (isAutoPlaying && secondsLeft <= 0) {
      isFlowRunningRef.current = false;
      showToast("Time up! スプリントセッションが終了しました。", "success");
      handlePersistAndRedirect(0);
    }
  }, [isAutoPlaying, secondsLeft, showToast, handlePersistAndRedirect]);

  // 🔄 初期マウント & 設定同期
  useEffect(() => {
    initSprint(questions, 'sprint', 0);
    setSecondsLeft(timeLimitSec);
    toggleAutoPlay(true);
    return () => {
      clearSession();
    };
  }, [questions, initSprint, clearSession, toggleAutoPlay, timeLimitSec]);

  // 🔄 問題切り替え時
  useEffect(() => {
    if (currentQuestion) {
      stopAllAudio();
      (async () => {
        await runSprintFlow(currentQuestion);
      })();
    }
  }, [currentIndex, currentQuestion, runSprintFlow, stopAllAudio]);

  // ⚙️ 画面固定クリーンアップ
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

  // ⏳ 🔒 サーバーへの非同期処理送信中のフルスクリーン画面ロック
  if (isSaving) {
    return (
      <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-fade-in select-none">
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl w-full max-w-md text-center space-y-4 animate-scale-up">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Syncing Performance</h2>
          <p className="text-xs font-bold text-slate-400">今回のスプリント成績をクラウドに安全に同期しています...</p>
        </div>
      </div>
    );
  }

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
              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-0.5">Sprint Mode</span>
              <h1 className="text-sm font-black text-slate-800 tracking-tight text-center max-w-[200px] truncate">{courseTitle}</h1>
            </div>

            <div className={`h-10 min-w-[75px] border rounded-xl flex items-center justify-center gap-1.5 px-3 transition-colors duration-300 ${
              isTimeWarning 
                ? 'bg-amber-50 border-amber-200 text-amber-700 animate-[pulse_2s_infinite_ease-in-out]' 
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <Timer size={14} className={isTimeWarning ? "text-amber-600" : "text-slate-400"} />
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
                transition: secondsLeft <= 0 ? 'none' : 'width 1s linear'
              }}
            />
          </div>
        </div>

        {/* 中央：メインコンテンツエリア */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8">
          <div className="w-full flex flex-col items-center space-y-6">
            
            <div className="relative w-32 h-32 flex items-center justify-center">
              {audioPhase !== 'idle' && audioPhase !== 'thinking' && (
                <>
                  <span className="animate-ping absolute inline-flex h-24 w-24 rounded-full bg-indigo-500/10 opacity-75"></span>
                  <span className="animate-pulse absolute inline-flex h-28 w-28 rounded-full bg-indigo-600/5 opacity-50"></span>
                </>
              )}
              {audioPhase === 'thinking' && (
                <span className="animate-ping absolute inline-flex h-24 w-24 rounded-full bg-emerald-500/10 opacity-60"></span>
              )}
              
              <div className={`w-24 h-24 rounded-3xl flex items-center justify-center border transition-all duration-300 shadow-sm ${
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
              <div className="flex flex-col items-center gap-2">
                {questionType === '0' ? (
                  <div className="h-5.5 px-3 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 font-mono text-[11px] font-bold tracking-wider gap-1">
                    <span>Question</span>
                    <span className="text-indigo-600 font-black">{currentIndex + 1}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="h-5.5 px-3 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100/80 font-mono text-[11px] font-black tracking-wider gap-1">
                      <span>Question</span>
                      <span className="text-indigo-700 font-black">{groupData.uniqueGroupIndex}</span>
                    </div>
                    <div className="flex items-center gap-1.5 h-2">
                      {Array.from({ length: groupData.totalInGroup }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-2 rounded-full transition-all duration-300 ${
                            i === groupData.currentInGroup 
                              ? 'w-4 bg-indigo-600' 
                              : 'w-2 bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <h2 className="text-lg font-black tracking-tight text-slate-800 transition-colors duration-200">
                  {audioPhase === 'statement' && "Listen Base Sentence"}
                  {audioPhase === 'question' && questionLabelEN}
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

      </main>
    </div>
  );
};