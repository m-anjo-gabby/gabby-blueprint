'use client';

import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { SPRINT_FLOW_TIMING, SprintQuestion } from "@gabby/types/sprint";
import { AnalysisResult } from "@gabby/types/speechAssessment";
import { QuestionCard } from "./QuestionCard";
import { SprintDrillPlayerControls } from "./SprintDrillPlayerControls";
import { SprintFeedback } from "./SprintFeedback";
import { ExitProcessingOverlay } from "./ExitProcessingOverlay";
import { AudioResumeBanner } from "@/components/common/AudioResumeBanner";
import { ChevronLeft, Square, Loader2 } from 'lucide-react';

import { useSprintStore } from '@/stores/useSprintStore';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useExitConfirmFlow } from '@gabby/lib/hooks/useExitConfirmFlow';
import { getFeedbackConfig, getSprintTitle, resolveSprintHasLevel, setAudioSessionPlayback, extractContentWords } from '@gabby/lib';
import { logClientEvent } from '@gabby/lib/logger/actions';
import { useSprintAudio } from '@gabby/lib/hooks/useSprintAudio';
import { playStatementThenQuestion, useStopAllAudioCore, useFullscreenAudioLifecycle, useFlowGuard } from '@gabby/lib/hooks/useSprintPlaybackFlow';
import { useSprintProgressSync } from '../_hooks/useSprintProgressSync';

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

  const isStarted = !!initialStarted || !initialQuestionId;
  const [exitLoading, setExitLoading] = useState<boolean>(false);
  const [audioPhase, setAudioPhase] = useState<'idle' | 'statement' | 'question' | 'answer'>('idle');

  // ────────────── 🔌 Zustand ストア ──────────────
  const {
    session,
    config,
    drill,
    initSprint,
    nextStep,
    prevStep,
    setIsRevealed,
    setIsRecording,
    setPlayingQuestionSequence,
    setPlayingAnswerSequence,
    setFeedback,
    setAnalysis,
    toggleAutoPlay,
    commitDrillRecordingResult,
    contentName,
    contentMetadata,
  } = useSprintStore();

  const { currentIndex, isRecording } = session;
  const { contentId, questionType } = config;
  const { isRevealed, isAutoPlaying, feedback, analysis, evalType: drillEvalType } = drill;

  // ────────────── 🔊 音声・発話カスタムフック ──────────────
  const { startAssessment, stopListening, timeLeft } = useWebSpeech();
  const { playbackRate, changePlaybackRate } = usePlayAudioSpeech();

  // オーディオリソース（AudioContext / チャイム / 再生Promise）を共通フックで管理
  // マウント/アンマウント時の初期化・クリーンアップも内部で行う
  const { playTrack: playTrackBase, playChime, stopTrack, unlockAudioContext, resumeStatus } = useSprintAudio(stopListening);

  const currentQuestion = questions?.[currentIndex];

  const isInitialized = useRef<boolean>(false);
  const prevAnalysisRef = useRef<AnalysisResult | null>(null);
  const prevIndexRef = useRef<number>(currentIndex);

  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigating = useRef<boolean>(false);

  // 💡 フロー管理用の一意のカウンターID（Drill/Sprint共通のキャンセルトークンフック）
  const { flowIdRef, invalidateFlow } = useFlowGuard();

  const isAutoPlayingRef = useRef(isAutoPlaying);
  const isRevealedRef = useRef(isRevealed);
  const wasRecordingRef = useRef<boolean>(false);
  // 🛠️ 解答再生時のスピードモード判定用。進捗同期フック（useSprintProgressSync）とは
  // 無関係な用途のため、自前で保持する（同期タイミングの変更に影響されないようにする）
  const questionTypeRef = useRef(questionType);

  useEffect(() => { isAutoPlayingRef.current = isAutoPlaying; }, [isAutoPlaying]);
  useEffect(() => { isRevealedRef.current = isRevealed; }, [isRevealed]);
  useEffect(() => { questionTypeRef.current = questionType; }, [questionType]);

  // ドリル進捗の5分ごと自動保存（内部で contentId/questionType の最新値を ref 経由で追従）
  const { syncProgressNow } = useSprintProgressSync(contentId, questionType);

  const hasLevel = resolveSprintHasLevel(contentMetadata);

  const courseTitle = useMemo(() => {
    return getSprintTitle(questionType || '0', Number(config.level), hasLevel);
  }, [questionType, config.level, hasLevel]);

  const groupProgress = useMemo(() => {
    if (!currentQuestion || !questions.length) return { groupCurrentIndex: 0, groupTotalCount: 1 };
    const currentGroupId = currentQuestion.group_id;
    const groupQuestions = currentGroupId ? questions.filter(q => q.group_id === currentGroupId) : [currentQuestion];
    const groupCurrentIndex = groupQuestions.indexOf(currentQuestion);
    return { groupCurrentIndex: groupCurrentIndex >= 0 ? groupCurrentIndex : 0, groupTotalCount: groupQuestions.length };
  }, [currentQuestion, questions]);


  // 🔊 音声再生コアロジック
  // 💡 古い非同期 Promise の完了割り込みを防ぐため、常にカウンターを進めて全体をリセットする
  const stopAllAudioCore = useStopAllAudioCore(stopTrack, stopListening);

  const stopAllAudio = useCallback(() => {
    invalidateFlow();
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    stopAllAudioCore();

    setPlayingQuestionSequence(false);
    setPlayingAnswerSequence(false);
    setAudioPhase('idle');
    setIsRecording(false);
  }, [invalidateFlow, stopAllAudioCore, setPlayingQuestionSequence, setPlayingAnswerSequence, setIsRecording]);


  /**
   * 音声が再生できない場合の共通ハンドラ
   * 代替読み上げ（TTSフォールバック）は行わず、ユーザーへの通知とサーバーログ記録のみ行う。
   * 音声ファイルは常に用意されている前提のため、発生時は運用側で把握できるようにする。
   */
  const handleAudioUnavailable = useCallback((text: string, audioPath: string | null, error: unknown) => {
    showToast('音声を再生できません', 'error');
    logClientEvent({
      service: 'student',
      event: 'sprint:audio_playback_failed',
      message: `Drill audio unavailable: ${currentQuestion?.question_id ?? 'unknown'}`,
      payload: {
        contentId,
        questionId: currentQuestion?.question_id,
        mode: 'drill',
        text,
        audioPath,
        error: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => { /* ログ送信自体の失敗はユーザー体験に影響させない */ });
  }, [contentId, currentQuestion, showToast]);

  const playSingleTrack = useCallback((text: string, audioPath: string | null): Promise<void> => {
    return playTrackBase(text, audioPath, {
      playbackRate,
      exitLoading,
      onError: (err) => handleAudioUnavailable(text, audioPath, err),
    });
  }, [playTrackBase, playbackRate, exitLoading, handleAudioUnavailable]);

  // 💡 一意の currentFlowId を受け取り、非同期 await の直後に厳密にチェックを行う
  const playQuestionSequence = useCallback(async (question: SprintQuestion, currentFlowId: number) => {
    if (!question) return;
    setPlayingQuestionSequence(true);
    
    try {
      const { cancelled } = await playStatementThenQuestion(question, {
        playTrack: playSingleTrack,
        isCancelled: () => flowIdRef.current !== currentFlowId, // 割り込み時は即座に処理を中断
        onStatementPhase: () => setAudioPhase('statement'),
        onQuestionPhase: () => setAudioPhase('question'),
      });
      if (cancelled) return;

      setAudioPhase('answer');
    } catch (e) {
      console.error("Question sequence error:", e);
    } finally {
      if (flowIdRef.current === currentFlowId) {
        setPlayingQuestionSequence(false);
      }
    }
  }, [playSingleTrack, setPlayingQuestionSequence, flowIdRef]);

  // 💡 解答フェーズ用の一意の currentFlowId 追従ロジック
  const playAnswerSequence = useCallback(async (question: SprintQuestion, currentFlowId: number) => {
    if (!question) return;
    setPlayingAnswerSequence(true);
    setAudioPhase('answer');
    
    const currentStore = useSprintStore.getState();
    const isSpeedMode = questionTypeRef.current === '0';
    const hasEvaluated = currentStore.drill.analysis !== null;

    try {
      if (isSpeedMode && hasEvaluated) {
        // Speedの発話評価を行った場合は、スイッチで選択されている解答だけを再生する
        if (currentStore.drill.evalType === 'yes' && question.answer_sentence_yes_en) {
          await playSingleTrack(question.answer_sentence_yes_en, question.answer_sentence_yes_voice);
        } else if (currentStore.drill.evalType === 'no' && question.answer_sentence_no_en) {
          await playSingleTrack(question.answer_sentence_no_en, question.answer_sentence_no_voice);
        }
      } else {
        if (question.answer_sentence_yes_en) {
          await playSingleTrack(question.answer_sentence_yes_en, question.answer_sentence_yes_voice);
          if (flowIdRef.current !== currentFlowId) return;
        }
        if (question.answer_sentence_no_en) {
          await new Promise(r => setTimeout(r, SPRINT_FLOW_TIMING.drill.yesNoAnswerGapMs));
          if (flowIdRef.current !== currentFlowId) return;
          await playSingleTrack(question.answer_sentence_no_en, question.answer_sentence_no_voice);
          if (flowIdRef.current !== currentFlowId) return;
        }
      }
      
      setAudioPhase('idle');

      // 🚀 解答再生完了後に、自動再生中であれば次のカードに進む
      if (isAutoPlayingRef.current) {
        autoPlayTimerRef.current = setTimeout(() => {
          handleNextRef.current();
        }, SPRINT_FLOW_TIMING.drill.nextCardDelayMs);
      }
    } catch (e) {
      console.error("Answer sequence error:", e);
    } finally {
      if (flowIdRef.current === currentFlowId) {
        setPlayingAnswerSequence(false);
      }
    }
  }, [playSingleTrack, setPlayingAnswerSequence, flowIdRef]);

  // 🎮 操作ハンドラー
  const handleReveal = useCallback(async () => {
    if (!isStarted || !currentQuestion || isRevealed) return;
    await unlockAudioContext();
    stopAllAudio();
    setIsRevealed(true);
  }, [isStarted, currentQuestion, isRevealed, setIsRevealed, stopAllAudio, unlockAudioContext]);

  const handleNext = useCallback(async () => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    await unlockAudioContext();
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
  }, [stopAllAudio, nextStep, toggleAutoPlay, showToast, onExit, syncProgressNow, unlockAudioContext]);

  const handleNextRef = useRef(handleNext);
  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  const handlePrev = useCallback(async () => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    await unlockAudioContext();
    stopAllAudio();
    prevStep();
    setTimeout(() => { isNavigating.current = false; }, 400);
  }, [stopAllAudio, prevStep, unlockAudioContext]);

  const handleManualPlayAudio = useCallback(async () => {
    if (isRecording || !currentQuestion) return;
    await unlockAudioContext();
    stopAllAudio();
    playQuestionSequence(currentQuestion, flowIdRef.current);
  }, [currentQuestion, isRecording, playQuestionSequence, stopAllAudio, unlockAudioContext, flowIdRef]);

  const handleIndividualPlayAudio = useCallback(async (voiceUrl: string | null, text: string) => {
    if (isRecording || isAutoPlayingRef.current) return; 
    await unlockAudioContext();
    playSingleTrack(text, voiceUrl);
  }, [playSingleTrack, isRecording, isAutoPlayingRef, unlockAudioContext]);

  const handleSelectRate = useCallback((targetRate: number) => {
    changePlaybackRate(targetRate);
  }, [changePlaybackRate]);

  // チャイム音を AudioContext 経由で再生（useSprintAudio フック内に集約）

  const handleStartRecord = useCallback(async () => {
    if (!currentQuestion) return;
    await unlockAudioContext();

    const targetText = (questionType === '0')
      ? (drillEvalType === 'no' ? (currentQuestion.answer_sentence_no_en ?? "") : currentQuestion.answer_sentence_yes_en)
      : currentQuestion.answer_sentence_yes_en;

    if (!targetText) return;

    // 1. 再生中の音声を停止し、発話前の状態をリセット
    stopAllAudio();
    setFeedback(null);
    setAnalysis(null);
    setIsRevealed(false);

    // 2. 発話フェーズ UIを先に表示（「回答しましょう」状態、インジケーターはまだ非表示）
    setAudioPhase('answer');

    // 3. チャイム再生（非同期）と録音開始（マイクアクティブ化）を同時にパラレル起動
    playChime();

    const contentWords = extractContentWords(targetText);

    wasRecordingRef.current = true;

    startAssessment(
      targetText,
      contentWords,
      (result) => {
        // 🚀 iOSでスピーカー出力を即時回復させるため、再生モードに戻す
        setAudioSessionPlayback();

        // 状態更新をアトミックにまとめて反映
        commitDrillRecordingResult(result, getFeedbackConfig(result.score));
        useSprintStore.getState().incrementAssessmentCount();
      },
      {
        suppressAudioSessionSwitch: true,
        // 実際にマイクが開いた時点で録音インジケータをオンにする
        onRecognitionStart: () => {
          setIsRecording(true);
        }
      }
    );
  }, [currentQuestion, questionType, drillEvalType, stopAllAudio, playChime, setIsRecording, startAssessment, commitDrillRecordingResult]);


  const handleStopRecord = useCallback(() => {
    stopListening();
  }, [stopListening]);

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
        }, SPRINT_FLOW_TIMING.drill.thinkingTimeMs);
      }
    };
    runRestart();
  }, [currentQuestion, playQuestionSequence, setIsRevealed, stopAllAudio, flowIdRef]);

  const handleToggleAutoPlay = useCallback(async () => {
    if (!isAutoPlaying) {
      const ok = await showConfirm("自動再生を開始しますか？", "Start Auto Play?", { variant: 'info', isModal: false });
      if (!ok) return;
      
      setIsRevealed(false); // オート再生開始時に Revealed をリセット
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
        session: { ...state.session, pendingQuestionCount: state.session.pendingQuestionCount + 1 }
      }));
      syncProgressNow();
    }
  }, [questions, initialQuestionId, initSprint, showToast, syncProgressNow]);

  // 🚀 終了確認→ローディング表示→マイク録音/再生の強制クリーンアップ→進捗同期→
  // iOSのマイク解放待ちバッファ→実際の離脱、という一連の流れは Word/Sprint 共通のためフック化
  const handleExitWithSync = useExitConfirmFlow({
    guard: () => isAutoPlaying,
    confirmTitle: "トレーニングを終了しますか？",
    confirmMessage: "前の画面に戻ります。",
    confirmVariant: 'info',
    setLoading: setExitLoading,
    cleanup: stopAllAudio,
    sync: syncProgressNow,
    bufferMs: SPRINT_FLOW_TIMING.shared.exitSafetyBufferMs,
    onExit: () => onExit?.(),
  });

  // タイムライン1：問題カード変更検知
  useEffect(() => {
    if (!currentQuestion || !isStarted || exitLoading) return;

    stopAllAudio();
    const currentFlowId = flowIdRef.current;

    const runQuestionFlow = async () => {
      // 🚀 初回（1問目）の場合は開始アナウンスとの余白（クッション）を取るため、2問目以降より長く待つ
      const initialDelay = currentIndex === 0
        ? SPRINT_FLOW_TIMING.shared.initialCushionFirstMs
        : SPRINT_FLOW_TIMING.shared.initialCushionSubsequentMs;
      await new Promise(resolve => setTimeout(resolve, initialDelay));
      if (flowIdRef.current !== currentFlowId) return;

      await playQuestionSequence(currentQuestion, currentFlowId);
      if (flowIdRef.current !== currentFlowId) return;
      
      if (isAutoPlayingRef.current && !isRevealedRef.current) {
        autoPlayTimerRef.current = setTimeout(() => {
          setIsRevealed(true);
        }, SPRINT_FLOW_TIMING.drill.thinkingTimeMs);
      }
    };

    runQuestionFlow();
    
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
    // ✨ 依存関係を厳密に制限。毎秒変わる state などによる再トリガーを防ぐ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentQuestion?.question_id, isStarted, exitLoading]);

  useEffect(() => {
    // カードが切り替わった場合は、直前の評価結果の記録をクリア
    if (currentIndex !== prevIndexRef.current) {
      prevIndexRef.current = currentIndex;
      prevAnalysisRef.current = null;
    }

    const prev = prevAnalysisRef.current;
    prevAnalysisRef.current = analysis;

    // 録音中（発話評価中）の場合は再生しない
    if (!isRevealed || !currentQuestion || isRecording) return;

    // 評価結果が存在していた状態から null にリセットされた場合（再録音開始時）は再生しない
    if (prev !== null && analysis === null) {
      return;
    }

    // 解答再生時は、現在の再生フローIDを引き継ぎ、二重再生にならないように管理
    const currentFlowId = flowIdRef.current;

    const runAnswerFlow = async () => {
      // 🚀 直前に録音していた場合（自動解答オープン）のみ、iOSセッション移行時間を考慮して待機。
      // 手動で解答を表示した場合は待機なし（0ms）で即時に再生する。
      const delay = wasRecordingRef.current ? SPRINT_FLOW_TIMING.drill.postRecordingAnswerDelayMs : 0;
      wasRecordingRef.current = false; // 判定したらフラグを下ろす

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      if (flowIdRef.current !== currentFlowId) return;

      await playAnswerSequence(currentQuestion, currentFlowId);
      if (flowIdRef.current !== currentFlowId) return;

      if (isAutoPlayingRef.current) {
        autoPlayTimerRef.current = setTimeout(() => {
          handleNextRef.current();
        }, SPRINT_FLOW_TIMING.drill.nextCardDelayMs);
      }
    };

    runAnswerFlow();

    return () => {
      // タイムライン2の再トリガーによる不要なタイマー消失を防ぐため、ここでの自動クリアは行いません。
      // タイマーのクリアは stopAllAudio や handleToggleAutoPlay で適切に管理されています。
    };
    // ✨ 依存をインデックス、オープン状態、評価結果、および録音状態に絞り、タイマー副作用から切り離し
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRevealed, currentIndex, analysis, isRecording]);

  // フルスクリーン固定およびiOSオーディオセッション固定化
  // 🚀 開始タップ同期内で既に play-and-record に移行しているため、マウント時の再設定は不要
  useFullscreenAudioLifecycle(stopAllAudio);

  // 🛡️ View 層：問題が1件も無い場合の空状態ガード（戻る手段の無い無限ローディングを防ぐ）
  if (!questions || questions.length === 0 || !currentQuestion) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl w-full max-w-md text-center space-y-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Preparing Questions</h2>
          <button onClick={() => onExit?.()} className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest">Go Back</button>
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
              <button onClick={handleExitWithSync} disabled={isAutoPlaying} className="h-9 w-9 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none">
                <ChevronLeft size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="col-span-3 flex flex-col items-center min-w-0">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-0.5">{contentName || 'Drill Mode'}</span>
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
                自動再生を停止
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

        <AudioResumeBanner status={resumeStatus} onResume={() => { unlockAudioContext(); }} />

        <ExitProcessingOverlay visible={exitLoading} />
      </main>
    </div>
  );
};