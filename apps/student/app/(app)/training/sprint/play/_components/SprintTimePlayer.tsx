'use client';

import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Timer, CircleDot, ArrowRight, CheckCircle2, Headphones, Mic, MicOff, FastForward, Loader2, ChartSpline } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "@/lib/utils";
import { useToast } from '@gabby/lib/hooks/useToast';
import { useExitConfirmFlow } from '@gabby/lib/hooks/useExitConfirmFlow';
import { getFeedbackConfig, getScoreTier, getSprintTitle, resolveSprintHasLevel, cleanAnswerWords } from '@gabby/lib';
import { logClientEvent } from '@gabby/lib/logger/actions';
import { SprintQuestion, SPRINT_FLOW_TIMING } from "@gabby/types/sprint";
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { useSprintAudio } from '@gabby/lib/hooks/useSprintAudio';
import { playStatementThenQuestion, useStopAllAudioCore, useFullscreenAudioLifecycle, useFlowGuard } from '@gabby/lib/hooks/useSprintPlaybackFlow';
import { useMicPermission } from '@gabby/lib/hooks/useMicPermission';
import { useSprintStore } from '@/stores/useSprintStore';
import { createSprintScoreAction, SprintHistoryItem } from '@/actions/sprintAction';
import { useSprintCountdown, useAutoRedirectCountdown } from '../_hooks/useSprintTimers';
import { ExitProcessingOverlay } from './ExitProcessingOverlay';
import { AudioResumeBanner } from '@/components/common/AudioResumeBanner';
import { CircularProgressRing } from '@/components/common/CircularProgressRing';
import { QuestionStepBadge, StepIndicator } from '@/components/common/QuestionStepBadge';

interface SprintTimePlayerProps {
  questions: SprintQuestion[];
  onExit?: () => void;
}

// 完了オーバーレイ用：結果先出しスタッツの数値をイーズアウトでカウントアップさせる
function useCountUp(target: number, active: boolean, duration = 700): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    // active===false（value未確定＝発話評価OFF等）の間はアニメーション自体不要。
    // 表示側（StatPreviewTile）も value===null の間は animated を参照しないため、ここでの状態リセットは不要
    if (!active) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  return value;
}

interface StatPreviewTileProps {
  icon: React.ElementType;
  label: string;
  value: number | null; // null は「このセッションでは対象外」を表す（発話評価OFF等）
  suffix?: string;
  color: string;
  active: boolean;
}

// タイムアップ完了オーバーレイ内の「結果先出し」プレビュー統計タイル
const StatPreviewTile: React.FC<StatPreviewTileProps> = ({ icon: Icon, label, value, suffix, color, active }) => {
  const animated = useCountUp(value ?? 0, active && value !== null);
  return (
    <div className="flex items-center gap-1.5 h-5 whitespace-nowrap">
      <Icon size={13} strokeWidth={2.5} className={cn(color, "shrink-0")} />
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">{label}</span>
      <span className="text-sm font-black text-slate-800 font-mono leading-none inline-flex items-baseline">
        {value === null ? (
          <span className="text-slate-400 font-normal">-</span>
        ) : (
          <>
            {animated}
            {suffix && <span className="text-[10px] font-medium text-slate-400 ml-0.5 font-sans">{suffix}</span>}
          </>
        )}
      </span>
    </div>
  );
};


export const SprintTimePlayer: React.FC<SprintTimePlayerProps> = ({ 
  questions = [],
  onExit
}) => {
  const router = useRouter();
  const { showToast } = useToast();

  // ────────────── 🔌 Zustand ストア ──────────────
  const {
    session,
    config,
    clearSessionProgress,
    resetStore,
    commitAssessmentResult,
    commitSkipResult,
    setIsRecording,
    incrementAssessmentCount,
    contentName,
    contentMetadata,
  } = useSprintStore();

  const { currentIndex } = session;
  const { questionType, answerType, level, timeLimitSec, isAssessmentMode } = config;

  // ────────────── 📦 ローカル管理ステート ──────────────
  const [exitLoading, setExitLoading] = useState<boolean>(false);
  const [audioPhase, setAudioPhase] = useState<'idle' | 'statement' | 'question' | 'answer'>('idle');
  // 🆕 直近の非idleフェーズを保持するref。2問目以降の問題切替時に発生する短い idle 区間（クッション）で
  // 毎回「Ready」がちらつくのを防ぎ、直前のメッセージ／アイコンを表示し続けるために使用する
  const lastActivePhaseRef = useRef<'statement' | 'question' | 'answer'>('statement');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [showTimeUpOverlay, setShowTimeUpOverlay] = useState<boolean>(false);
  // 🆕 完了オーバーレイの「結果先出し」プレビュー用。サーバー保存の成否を待たず、
  // 保存処理に入った時点で確定しているセッション内訳をそのまま先出し表示する
  const [previewStats, setPreviewStats] = useState<{ answered: number; assessments: number; avgScore: number; isAssessmentMode: boolean } | null>(null);
  const [assessmentVisualState, setAssessmentVisualState] = useState<'idle' | 'excellent' | 'great' | 'good' | 'fair' | 'poor'>('idle');
  
  // チャイム再生開始〜 recognition.onstart までの短い待機窓口だけ true
  // （発話評価完了後に誤って MicOff を表示しないための専用フラグ）
  const [isAwaitingRecording, setIsAwaitingRecording] = useState<boolean>(false);

  // ────────────── 音声カスタムフック ──────────────
  const { startAssessment, stopListening, timeLeft } = useWebSpeech();

  // オーディオリソース（AudioContext / チャイム / 再生Promise）を共通フックで管理
  // マウント/アンマウント時の初期化・クリーンアップも内部で行う
  // 💡 Sprintモードは再生速度変更UIを持たないため、playbackRate指定なし（常に等速）で再生する
  const { playTrack: playTrackBase, playChime, stopTrack, unlockAudioContext, resumeStatus } = useSprintAudio(stopListening);

  // マイク権限の監視（SprintTimePlayer ではテスト機能は使わず、micStatus のみ参照）
  const { micStatus } = useMicPermission();

  const currentQuestion = questions?.[currentIndex];

  // 🛠️ 音声再生失敗（代替読み上げは行わない）の直近の発生を記録するref。
  // playStatementThenQuestion の完了直後にこれを確認し、問題文が聞こえないまま
  // 回答フェーズへ進んでしまうのを防ぐ（該当問題はスキップして履歴からも除外する）。
  const lastAudioErrorRef = useRef<{ text: string; audioPath: string | null; error: unknown } | null>(null);

  const playTrack = useCallback((text: string, audioPath: string | null): Promise<void> => {
    return playTrackBase(text, audioPath, {
      exitLoading,
      onError: (err) => { lastAudioErrorRef.current = { text, audioPath, error: err }; },
    });
  }, [playTrackBase, exitLoading]);

  // フロー管理用の一意のカウンターID（Drill/Sprint共通のキャンセルトークンフック）
  const { flowIdRef, invalidateFlow } = useFlowGuard();
  const skippedQuestionIdsRef = useRef<Set<string>>(new Set());
  // 🛠️ 音声再生に失敗した問題のID。回答履歴（answered_history）から除外するために使用
  const audioFailedQuestionIdsRef = useRef<Set<string>>(new Set());
  const isPersistedRef = useRef<boolean>(false);
  // 🆕 タイムアップ経由での確定処理かどうか。true の間は発話評価完了時の演出（結果表示ウェイト）をスキップし、即座に保存へ進む
  const timeUpTriggeredRef = useRef<boolean>(false);
  // 🆕 発話評価は完了したが、演出ウェイト（displayDelay）の反映待ちだった問題を、タイムアップ時に即時確定させるためのコミット関数を保持
  const pendingCommitRef = useRef<(() => void) | null>(null);

  const SHARED_BRAND_BUTTON = "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] shadow-md shadow-indigo-600/10 text-white border-none";

  const hasLevel = resolveSprintHasLevel(contentMetadata);

  const courseTitle = useMemo(() => {
    return getSprintTitle(questionType || '0', Number(level), hasLevel);
  }, [questionType, level, hasLevel]);

  const isSpeedMode = questionType === '0';
  const isQuestionBased = questionType === '0' || questionType === '6';

  const userActionSteps = useMemo(() => {
    if (isSpeedMode) return ["質問文", "回答"];
    return ["基本文", isQuestionBased ? "質問文" : "指示文", "回答"];
  }, [isSpeedMode, isQuestionBased]);

  const currentActionIndex = useMemo(() => {
    if (isSpeedMode) {
      if (audioPhase === 'answer') return 1;
      return 0; // idle（初期表示）・question ともに先頭ステップ（問題文）を指す
    }
    if (audioPhase === 'answer') return 2;
    if (audioPhase === 'question') return 1;
    return 0; // idle（初期表示）・statement ともに先頭ステップ（基本文）を指す
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

  // 全てのオーディオ・発話を安全に即時ストップする
  // 🚀 stopListening も同時に呼び、audioSession を 'playback' に戻すことで
  // タイムアップ・スキップ・終了の全経路でマイクが確実に解放される
  const stopAllAudioCore = useStopAllAudioCore(stopTrack, stopListening);

  const stopAllAudio = useCallback(() => {
    invalidateFlow();
    stopAllAudioCore();

    // 録音 UI 状態もリセット
    setIsAwaitingRecording(true); // 遷移中のチラつき防止のため待機中にしておく
    setIsRecording(false);
    setAudioPhase('idle');
  }, [invalidateFlow, stopAllAudioCore, setIsRecording]);

  const handlePersistAndRedirect = useCallback(async (currentSecondsLeft: number, includeCurrentOnTimeUp: boolean = false) => {
    if (isPersistedRef.current) return;
    isPersistedRef.current = true;
    setIsSaving(true);

    // 🚀 保存/リダイレクト処理に入った瞬間に再生・録音をすべて即時停止し、マイクを確実に解放する
    stopAllAudio();

    const storeState = useSprintStore.getState();
    const { sprintType, contentId } = storeState.config;
    const { sessionResults } = storeState.session;

    // 4つの必須パラメータが揃っているかチェック（型ガード）
    if (!sprintType || !contentId || !questionType || !answerType) {
      console.error("Missing required sprint parameters:", { sprintType, contentId, questionType, answerType });
      showToast("パラメータが不足しているため、実績を保存できませんでした。", "error");
      setIsSaving(false);
      onExit?.();
      return;
    }

    // 🆕 タイムアップ時点で回答フェーズだった問題は、includeCurrentOnTimeUp が true の場合のみ回答履歴に含める
    // （基本文・指示文・質問文の再生中や、発話評価の録音開始前は対象外）
    const answeredCount = currentSecondsLeft <= 0
      ? (includeCurrentOnTimeUp ? Math.min(currentIndex + 1, questions.length) : currentIndex)
      : Math.min(currentIndex + 1, questions.length);
    // 🛠️ 音声再生に失敗した問題は回答履歴（answered_history）から完全に除外する
    const slicedQuestions = questions
      .slice(0, answeredCount)
      .filter(q => !audioFailedQuestionIdsRef.current.has(q.question_id));

    const history: SprintHistoryItem[] = slicedQuestions.map((q, idx) => {
      const resultRecord = sessionResults.find(r => r.questionId === q.question_id);
      return {
        question_id: q.question_id,
        group_id: q.group_id || null,
        seq_no: idx + 1,
        is_skipped: resultRecord?.isSkipped || false,
        // 🆕 結果画面のタップ時フィードバック表示に必要な詳細（summary/matches/issues）も併せて保存する
        assessment: (resultRecord?.feedback && resultRecord.analysis) ? {
          total_score: Math.round(resultRecord.analysis.score * 100),
          analysis: {
            score: resultRecord.analysis.score,
            summary: resultRecord.analysis.summary,
            matches: resultRecord.analysis.matches,
            issues: resultRecord.analysis.issues,
          },
        } : null,
      };
    });

    const assessedHistory = history.filter(h => !h.is_skipped && h.assessment);
    const totalAssessments = assessedHistory.length;

    // 🆕 完了オーバーレイの結果先出しプレビュー。保存API完了を待たず、確定済みの内訳をこの時点で表示に反映する
    const previewAvgScore = totalAssessments > 0
      ? Math.round(assessedHistory.reduce((sum, h) => sum + (h.assessment?.total_score ?? 0), 0) / totalAssessments)
      : 0;
    setPreviewStats({
      answered: slicedQuestions.length,
      assessments: totalAssessments,
      avgScore: previewAvgScore,
      isAssessmentMode,
    });

    try {
      const res = await createSprintScoreAction({
        sprint_type: sprintType,
        content_id: contentId,
        question_type: questionType as "0" | "4" | "5" | "6",
        answer_type: answerType,
        difficulty_level: Number(level),
        time_limit_sec: timeLimitSec,
        total_answered: slicedQuestions.length,
        total_assessments: totalAssessments,
        history: history,
      });

      if (res.success && res.data) {
        setResultId(res.data.self_sprint_id);
        if (currentSecondsLeft <= 0) {
          setShowTimeUpOverlay(true);
        } else {
          stopAllAudio();
          resetStore();
          // 🚀 iOSのマイク解放・オーディオセッション切り替え完了を待つために安全バッファを置いてから遷移する
          const targetUrl = `/training/sprint/result/${res.data.self_sprint_id}?from=play`;
          setTimeout(() => {
            router.push(targetUrl);
          }, SPRINT_FLOW_TIMING.sprint.resultRedirectBufferMs);
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
  }, [stopAllAudio, resetStore, router, showToast, onExit, currentIndex, questions, questionType, answerType, level, timeLimitSec, isAssessmentMode]);

  const handleGoToResult = useCallback(async () => {
    if (resultId) {
      await unlockAudioContext();
      stopAllAudio(); // stopListening と audioSession リセットを含む
      resetStore();
      // 🚀 iOSのマイク解放・オーディオセッション切り替え完了を待つために安全バッファを置いてから遷移する
      setTimeout(() => {
        router.push(`/training/sprint/result/${resultId}?from=play`);
      }, SPRINT_FLOW_TIMING.sprint.resultRedirectBufferMs);
    }
  }, [resultId, router, stopAllAudio, resetStore, unlockAudioContext]);

  const handleTimeUp = useCallback(() => {
    timeUpTriggeredRef.current = true;
    const { isRecording } = useSprintStore.getState().session;

    if (isRecording) {
      // 🆕 発話評価の録音中にタイムアップ：その時点までの認識結果で確定評価してから保存へ進む
      // （結果は startRecordingFor の onComplete → commitAndNext 経由で確定・保存される）
      stopListening();
      return;
    }

    if (pendingCommitRef.current) {
      // 🆕 発話評価は完了済みだが、結果演出（ウェイト）の反映待ちだった問題を即時確定させる
      pendingCommitRef.current();
      return;
    }

    // 🆕 回答フェーズ中（発話評価OFF・マイク拒否時、または録音開始前のチャイム待ちを除く）は「回答扱い」として履歴に含める
    // 基本文・指示文・質問文の再生中は対象外のまま
    const isBrainAnswer = micStatus === 'denied' || !isAssessmentMode;
    const includeCurrentOnTimeUp = audioPhase === 'answer' && (isBrainAnswer || !isAwaitingRecording);
    handlePersistAndRedirect(0, includeCurrentOnTimeUp);
  }, [handlePersistAndRedirect, stopListening, audioPhase, isAwaitingRecording, micStatus, isAssessmentMode]);

  // 制限時間のカウントダウン。0になった時点で自動保存・リダイレクトへ進む
  const { secondsLeft, secondsLeftRef } = useSprintCountdown(timeLimitSec, handleTimeUp, clearSessionProgress);

  // タイムアップ完了オーバーレイ表示中、3.5秒後に自動で結果画面へ遷移する
  // 🆕 数値カウントダウンのテキスト表示は廃止し、CTA下の自動進行プログレスバー（アニメーション秒数と同期）で表現する
  useAutoRedirectCountdown(showTimeUpOverlay && !!resultId, handleGoToResult);

  const timeRatio = useMemo(() => secondsLeft / (timeLimitSec || 60), [secondsLeft, timeLimitSec]);
  const isWarning = timeRatio <= 0.5 && timeRatio > 0.2;
  const isCritical = timeRatio <= 0.2;

  const progressPercent = useMemo(() => {
    if (secondsLeft <= 0 || !timeLimitSec) return 0;
    return (secondsLeft / timeLimitSec) * 100;
  }, [secondsLeft, timeLimitSec]);

  // 評価コールバックを含む純粋な録音開始関数
  // secondsLeft は ref 経由で参照（毎秒の再生成を防ぎ、runSprintFlow の安定性を保つ）
  const startRecordingFor = useCallback((question: SprintQuestion) => {
    // 🚀 安全ガード：発話評価がOFFの場合は録音プロセスを実行しない
    if (!isAssessmentMode) return;

    const targetText = isSpeedMode
      ? (answerType === '1' ? (question.answer_sentence_no_en ?? "") : question.answer_sentence_yes_en)
      : question.answer_sentence_yes_en;

    if (!targetText) return;

    const cleanWords = cleanAnswerWords(targetText);
    const questionId = question.question_id;

    startAssessment(
      targetText,
      cleanWords,
      (result) => {
        if (skippedQuestionIdsRef.current.has(questionId)) return;

        // 評価完了時は必ず待機フラグをリセット（発話評価後に MicOff が表示されるのを防ぐ）
        setIsAwaitingRecording(false);
        setIsRecording(false);

        const visualState = getScoreTier(result.score);

        const commitAndNext = () => {
          pendingCommitRef.current = null;
          setAssessmentVisualState('idle');
          incrementAssessmentCount();
          const { isLast } = commitAssessmentResult(questionId, getFeedbackConfig(result.score), result);
          if (isLast || timeUpTriggeredRef.current) {
            if (isLast) showToast("すべての問題を消化しました！スプリント完了です。", "success");
            // 🆕 タイムアップ経由の確定時は、seconds=0・現在問題を含める指定で保存へ進む
            handlePersistAndRedirect(timeUpTriggeredRef.current ? 0 : secondsLeftRef.current, timeUpTriggeredRef.current);
          }
        };

        if (timeUpTriggeredRef.current) {
          // 🆕 タイムアップ経由の確定：結果演出（ウェイト）をスキップして即座に保存へ進む
          commitAndNext();
          return;
        }

        setAssessmentVisualState(visualState);
        // テンポ維持のため、スコアの高低でウェイトを置いて次へ進む
        const displayDelay = (visualState === 'excellent' || visualState === 'great' || visualState === 'good')
          ? SPRINT_FLOW_TIMING.sprint.visualFeedbackHoldGoodMs
          : SPRINT_FLOW_TIMING.sprint.visualFeedbackHoldPoorMs;
        pendingCommitRef.current = commitAndNext;
        setTimeout(() => { commitAndNext(); }, displayDelay);
      },
      {
        // 録音終了時に自動で playback に戻す
        suppressAudioSessionSwitch: true,
        // recognition.onstart 発火後（マイクが実際に開いた時点）で isRecording を true にする
        // → RECインジケータをブラウザの実際の録音開始に同期させる
        onRecognitionStart: () => {
          setIsAwaitingRecording(false); // MicOff 待機終了 → REC インジケータへ
          setIsRecording(true);
        },
      },
    );
  }, [isSpeedMode, answerType, setIsRecording, startAssessment, incrementAssessmentCount, commitAssessmentResult, showToast, handlePersistAndRedirect, isAssessmentMode]);

  /**
   * 問題文（statement/question）の音声が再生できなかった場合のハンドラ。
   * 代替読み上げ（TTSフォールバック）は行わず、ユーザーに通知した上でこの問題を
   * スキップし、回答履歴（answered_history）からも完全に除外する。
   */
  const handleAudioFailureSkip = useCallback(async (
    question: SprintQuestion,
    info: { text: string; audioPath: string | null; error: unknown },
  ) => {
    audioFailedQuestionIdsRef.current.add(question.question_id);
    showToast('この問題は音声を再生できないため、スキップしました。', 'error');
    logClientEvent({
      service: 'student',
      event: 'sprint:audio_playback_failed',
      message: `Sprint audio unavailable: ${question.question_id}`,
      payload: {
        contentId: config.contentId,
        questionId: question.question_id,
        mode: 'sprint',
        text: info.text,
        audioPath: info.audioPath,
        error: info.error instanceof Error ? info.error.message : String(info.error),
      },
    }).catch(() => { /* ログ送信自体の失敗はユーザー体験に影響させない */ });

    await unlockAudioContext();
    stopAllAudio();

    const { isLast } = commitSkipResult(question.question_id);
    if (isLast) {
      handlePersistAndRedirect(secondsLeftRef.current);
    }
  }, [showToast, config.contentId, unlockAudioContext, stopAllAudio, commitSkipResult, handlePersistAndRedirect, secondsLeftRef]);

  // ★ 音声再生→チャイム→録音を直接呼び出す直列フロー（useEffect 間接トリガーを廃止）
  const runSprintFlow = useCallback(async (question: SprintQuestion, currentFlowId: number) => {
    if (!question) return;
    try {
      lastAudioErrorRef.current = null;
      const { cancelled } = await playStatementThenQuestion(question, {
        playTrack,
        isCancelled: () => flowIdRef.current !== currentFlowId,
        onStatementPhase: () => setAudioPhase('statement'),
        onQuestionPhase: () => setAudioPhase('question'),
      });
      if (cancelled) return;

      if (lastAudioErrorRef.current) {
        const failedInfo = lastAudioErrorRef.current;
        lastAudioErrorRef.current = null;
        if (flowIdRef.current === currentFlowId) {
          await handleAudioFailureSkip(question, failedInfo);
        }
        return;
      }

      // answer フェーズ表示 + 待機フラグ ON（isRecording=false の間は MicOff で待機中を示す）
      setAudioPhase('answer');

      // 🚀 発話評価OFFモードの場合はマイクアクティブ（チャイム・録音）をバイパスして、ユーザーの手動スキップ回答待機にする[cite: 1]
      if (!isAssessmentMode) {
        setIsAwaitingRecording(false);
        return;
      }

      setIsAwaitingRecording(true);
      await new Promise(r => setTimeout(r, SPRINT_FLOW_TIMING.sprint.preChimeGapMs)); // 物理無音時間があるためiOSでも競合なし
      if (flowIdRef.current !== currentFlowId) return;

      // チャイム再生と録音開始（マイクアクティブ化）を完全に並行して同時に実行
      playChime();
      startRecordingFor(question);
    } catch (e) {
      console.error("Sprint flow error:", e);
      if (flowIdRef.current === currentFlowId) {
        setAudioPhase('answer');
      }
    }
  }, [playTrack, playChime, startRecordingFor, isAssessmentMode, handleAudioFailureSkip, flowIdRef]);

  const handleStopRecord = useCallback(() => {
    if (!isAssessmentMode) return;
    setIsAwaitingRecording(false);
    setIsRecording(false);
    stopListening();
  }, [setIsRecording, stopListening, isAssessmentMode]);

  const handleSkipQuestion = useCallback(async () => {
    if (!currentQuestion) return;

    await unlockAudioContext();
    skippedQuestionIdsRef.current.add(currentQuestion.question_id);

    stopAllAudio(); // stopListening + audioSession 'playback' + 録音 UI リセットをすべて含む

    const { isLast } = commitSkipResult(currentQuestion.question_id);
    if (isLast) {
      showToast("スプリントを終了します。", "success");
      handlePersistAndRedirect(secondsLeftRef.current);
    }
  }, [commitSkipResult, showToast, handlePersistAndRedirect, currentQuestion, stopAllAudio, unlockAudioContext]);

  // ────────────── 🔄 副作用 (Effects) ──────────────
  // 制限時間カウントダウン・タイムアップ後の結果画面自動遷移は useSprintCountdown / useAutoRedirectCountdown へ集約済み

  // インデックス（問題ID）変更時にフローを最初から走らせる
  useEffect(() => {
    if (!currentQuestion || secondsLeft <= 0 || showTimeUpOverlay || isSaving || exitLoading) return;

    stopAllAudio();
    setAudioPhase('idle');

    const currentFlowId = flowIdRef.current;
    (async () => {
      // 🚀 初回（1問目）の場合は開始アナウンスとの余白（クッション）を取るため、2問目以降より長く待つ
      const initialDelay = currentIndex === 0
        ? SPRINT_FLOW_TIMING.shared.initialCushionFirstMs
        : SPRINT_FLOW_TIMING.shared.initialCushionSubsequentMs;
      await new Promise(resolve => setTimeout(resolve, initialDelay));
      if (flowIdRef.current !== currentFlowId) return;
      await runSprintFlow(currentQuestion, currentFlowId);
    })();

    // 毎秒変わるステートによる再トリガーを避けるため、問題IDを基準に限定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentQuestion?.question_id, showTimeUpOverlay, isSaving, exitLoading]);

  // DOM/オーディオの強制クリーンアップおよびiOSオーディオセッション固定化
  // 🚀 開始タップ同期内で既に play-and-record に移行しているため、マウント時の再設定は不要
  useFullscreenAudioLifecycle(stopAllAudio);

  // 🚀 終了確認→ローディング表示→強制クリーンアップ→iOSのマイク解放待ちバッファ→
  // 実際の離脱、という一連の流れは Word/Sprint 共通のためフック化（進捗同期は不要なため sync 未指定）
  const handleExit = useExitConfirmFlow({
    confirmTitle: "Quit Sprint?",
    confirmMessage: "進行中のスプリントを終了して戻りますか？（スコアは記録されません）",
    confirmVariant: 'warning',
    setLoading: setExitLoading,
    cleanup: stopAllAudio,
    bufferMs: SPRINT_FLOW_TIMING.shared.exitSafetyBufferMs,
    onExit: () => onExit?.(),
  });

  // HUDはReady段階からセッション終了まで常に表示し、メッセージと活性制御だけを切り替える
  const showRecordingHud = true;
  // 発話評価OFFモードの場合は、回答時間中のマイク操作ウェイト（WAIT表現）を発生させない
  const isControlDisabled = isAssessmentMode ? (audioPhase !== 'answer' || isAwaitingRecording) : false;

  // 🚀 マイク拒否、またはそもそも発話評価OFFモードの場合を共通の「脳内で回答」ステート条件としてマッピング
  const isBrainAnswerMode = micStatus === 'denied' || !isAssessmentMode;

  // 🚀 追加：回答フェーズ以外（再生中等）の時は、発話評価OFFモード時のスキップボタンを非活性（disabled）に倒す制御フラグ[cite: 1]
  const isBrainActionDisabled = audioPhase !== 'answer';

  // 🆕 直前の非idleフェーズを記録（idle区間中のメッセージ表示継続に使用）
  useEffect(() => {
    if (audioPhase !== 'idle') {
      lastActivePhaseRef.current = audioPhase;
    }
  }, [audioPhase]);

  // 🆕 「Ready」表示は1問目の開始前のみとし、2問目以降のidle区間（問題切替クッション）では
  // 直前のメッセージ／アイコンを維持したまま次のフェーズへ切り替えることで、
  // Speedモード等での高頻度な「Ready」フラッシュ（ノイズ）を抑止する
  const displayPhase = (audioPhase === 'idle' && currentIndex > 0)
    ? lastActivePhaseRef.current
    : audioPhase;

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 overflow-hidden text-slate-900">
      <main className="bg-white border border-slate-100 w-full max-w-2xl h-full max-h-[95vh] rounded-[40px] flex flex-col relative overflow-hidden shadow-2xl">
        
        {/* ① 上部ヘッダー（プログレスバー一体型・タイトル領域最大化） */}
        <div className="shrink-0 w-full px-6 pt-5 pb-3 border-b border-slate-100/60 bg-white relative z-10">
          
          {/* 上段：ナビゲーション ＆ 拡大されたタイトル領域 */}
          <div className="flex items-center justify-between h-10">
            {/* 左：戻るボタン */}
            <button 
              onClick={handleExit}
              className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200/80 active:scale-95 cursor-pointer transition-all shrink-0"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>

            {/* 中央：タイマー排除により、圧倒的に広がったタイトル表示エリア */}
            <div className="flex-1 flex flex-col items-center px-4 min-w-0">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-0.5 select-none shrink-0">
                {contentName || 'Sprint Mode'}
              </span>
              <h1 className="text-sm font-black text-slate-800 tracking-tight text-center w-full max-w-[280px] sm:max-w-[360px] truncate">
                {courseTitle}
              </h1>
            </div>

            {/* 右：左右のビジュアルバランス（対称性）を保つためのクリアスペース */}
            <div className="w-10 h-10 shrink-0 pointer-events-none" aria-hidden="true" />
          </div>

          {/* 下段：数値秒数が美しく融合した、カプセル型インサイド・プログレスバー */}
          <div className="mt-4 w-full select-none">
            <div className="h-6 w-full bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/30">
              {/* 動的プログレスバー本体 */}
              <div 
                className={cn(
                  "absolute top-0 left-0 h-full rounded-full transition-all flex items-center justify-end pr-3 shadow-[inset_-3px_0_8px_rgba(0,0,0,0.05)]",
                  isCritical ? "bg-gradient-to-r from-rose-500 to-rose-600 shadow-[0_0_15px_rgba(225,29,72,0.2)]" :
                  isWarning ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                  "bg-gradient-to-r from-indigo-500 to-indigo-600"
                )}
                style={{ 
                  width: `${progressPercent}%`,
                  transition: secondsLeft <= 0 ? 'width 0.2s ease-out' : 'width 1s linear'
                }}
              />

              {/* 右端に完全固定された秒数表示レイヤー（バーの重なり度合いで文字色を動的に変化） */}
              <div className="absolute inset-y-0 right-3 flex items-center select-none pointer-events-none z-20">
                <div className={cn(
                  "flex items-center gap-1 font-mono text-xs font-black tracking-tight tabular-nums transition-colors duration-300 whitespace-nowrap",
                  progressPercent >= 90
                    ? "text-white"
                    : isCritical
                      ? "text-rose-600"
                      : isWarning
                        ? "text-amber-600"
                        : "text-slate-600"
                )}>
                  <Timer size={11} className={cn(isCritical && "animate-pulse")} strokeWidth={3} />
                  <span>{secondsLeft}s</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ② メイン垂直フレックスコンテナ */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto overscroll-contain">
          
          {/* ②-A: 問題番号・ステップ表示 */}
          <div className="w-full max-w-xl mx-auto flex flex-col gap-6 shrink-0 pb-4">
            {/* 問題番号表示 */}
            <QuestionStepBadge
              className="self-start"
              questionNumber={isSpeedMode ? currentIndex + 1 : groupData.uniqueGroupIndex}
              rightSlot={
                isSpeedMode ? (
                  <span className="text-[11px] font-black tracking-tight text-slate-700 whitespace-nowrap">
                    {answerType === '1' ? 'NOで回答' : 'YESで回答'}
                  </span>
                ) : (
                  <StepIndicator current={groupData.currentInGroup + 1} total={groupData.totalInGroup} />
                )
              }
            />

            {/* 改修箇所：洗練されたカプセル・コネクト型のステッププログレスバー表示 */}
            <div className="w-full flex justify-center pt-2 select-none">
              <div className="w-full max-w-md bg-slate-50 border border-slate-100 rounded-2xl p-2 flex items-center justify-between gap-1.5 sm:gap-3">
                {userActionSteps.map((step, idx) => {
                  const isCurrent = idx === currentActionIndex;
                  const isCompleted = idx < currentActionIndex;
                  
                  return (
                    <React.Fragment key={idx}>
                      {/* 各ステップのカプセル */}
                      <div className={cn(
                        "flex-1 flex items-center justify-center py-2 px-2 rounded-xl border text-center transition-all duration-300",
                        isCurrent 
                          ? "bg-indigo-600 border-indigo-600 text-white font-black shadow-md shadow-indigo-600/10 scale-[1.02]" 
                          : isCompleted 
                            ? "bg-indigo-50 border-indigo-100 text-indigo-600 font-bold" 
                            : "bg-white border-slate-200 text-slate-400 font-medium"
                      )}>
                        <span className="text-xs sm:text-sm tracking-tight whitespace-nowrap">
                          {step}
                        </span>
                      </div>

                      {/* ステップ間の矢印コネクタ（最後の要素以外） */}
                      {idx < userActionSteps.length - 1 && (
                        <span className={cn(
                          "text-xs font-bold font-mono transition-colors duration-300 shrink-0 px-0.5",
                          isCompleted ? "text-indigo-400" : "text-slate-300"
                        )}>
                          ➔
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ②-B: メッセージ ＋ ボタンエリア */}
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-2">
            
            {/* メッセージ表示部（瞬時に切り替わる） */}
            <div className="flex flex-col items-center justify-center gap-1.5 w-full max-w-xl mx-auto px-4 select-none shrink-0 min-h-[4rem] text-center">
              <div className="flex items-center justify-center gap-4">
                <div
                  className={cn(
                    "w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shrink-0 transition-colors duration-200",
                    displayPhase === 'idle'
                      ? "text-slate-300"
                      : displayPhase === 'answer'
                        ? (isBrainAnswerMode ? "text-rose-500" : "text-indigo-500")
                        : "text-indigo-600"
                  )}
                >
                  {displayPhase === 'answer' ? (
                    isBrainAnswerMode ? (
                      <MicOff className="w-full h-full" strokeWidth={2.5} />
                    ) : (
                      <CircleDot className="w-full h-full" strokeWidth={2.5} />
                    )
                  ) : displayPhase === 'idle' ? (
                    <CircleDot className="w-full h-full" strokeWidth={2.5} />
                  ) : (
                    <Headphones className="w-full h-full" strokeWidth={2.5} />
                  )}
                </div>
                <h2 className="text-lg sm:text-2xl font-black text-slate-800 tracking-tight whitespace-nowrap select-none">
                  {displayPhase === 'statement' && "基本文を再生中"}
                  {displayPhase === 'question' && (isQuestionBased ? "質問を再生中" : "指示文を再生中")}
                  {displayPhase === 'answer' && (
                    isBrainAnswerMode ? "脳内で回答しましょう" : "発話して回答しましょう"
                  )}
                  {displayPhase === 'idle' && "Ready"}
                </h2>
              </div>
              {/* サブテキスト表示（iOSでもメッセージを表示するように条件をシンプル化） */}
              <p className={cn(
                "text-xs sm:text-sm font-semibold text-slate-400 transition-opacity duration-150",
                displayPhase === 'answer' ? "opacity-100" : "opacity-0 select-none pointer-events-none"
              )}>
                {isBrainAnswerMode && displayPhase === 'answer'
                  ? (!isAssessmentMode ? "※発話評価をOFFにしています" : "※マイク権限が拒否されています")
                  : "※開始音の後に発話してください"}
                  {/* 🚀 iOS判定を削除し、どのデバイスでも開始音のアナウンスが流れるように統一 */}
              </p>
            </div>

            {/* 録音インジケータ ＋ ボタン（ふわっと表示する） */}
            <div className="min-h-[13rem] flex items-center justify-center w-full">
              <AnimatePresence mode="wait">
                {showRecordingHud ? (
                  <motion.div
                    key={isBrainAnswerMode ? "no-mic-hud" : "recording-hud"}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center gap-4 w-full"
                  >
                    {isBrainAnswerMode ? (
                      // 🚀 改修：発話評価OFF、またはマイク拒否状態の場合：回答フェーズに関わらず常にこのボタンレイアウトへ統一[cite: 1]
                      // 回答フェーズ（audioPhase === 'answer'）以外ではdisabled（非活性）として振る舞います[cite: 1]
                      <div className="flex flex-col items-center gap-4 py-4 w-full">
                        <div className="flex items-center gap-2 text-rose-500">
                          <MicOff size={16} strokeWidth={2.5} />
                          <span className="text-xs font-bold">
                            {!isAssessmentMode ? "発話なし" : "マイクが使用できません"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleSkipQuestion}
                          disabled={isSaving || isBrainActionDisabled}
                          className={cn(
                            "flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl text-white font-black text-sm tracking-wider shadow-md active:scale-[0.98] cursor-pointer transition-all w-60 group border-none",
                            isBrainActionDisabled 
                              ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none" 
                              : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10"
                          )}
                          title="この問題をスキップして次へ"
                        >
                          <FastForward size={16} strokeWidth={3} className={cn(!isBrainActionDisabled && "group-hover:translate-x-0.5 transition-transform")} />
                          <span>次の問題へ</span>
                        </button>
                      </div>
                    ) : (
                      // 通常の録音中／待機中／演出中のHUD
                      <>
                        {(() => {
                          const isExcellent = assessmentVisualState === 'excellent';
                          const isGreat = assessmentVisualState === 'great';
                          const isGood = assessmentVisualState === 'good';
                          const isFair = assessmentVisualState === 'fair';
                          const isPoor = assessmentVisualState === 'poor';
                          const isVisualizing = isExcellent || isGreat || isGood || isFair || isPoor;

                          const strokeColor = 
                            isExcellent ? "stroke-emerald-500" : 
                            isGreat ? "stroke-blue-500" : 
                            isGood ? "stroke-amber-500" : 
                            isFair ? "stroke-orange-500" : 
                            isPoor ? "stroke-rose-500" : 
                            isControlDisabled ? "stroke-slate-200" : "stroke-rose-500";
                          const trackColor = 
                            isExcellent ? "stroke-emerald-100" : 
                            isGreat ? "stroke-blue-100" : 
                            isGood ? "stroke-amber-100" : 
                            isFair ? "stroke-orange-100" : 
                            isPoor ? "stroke-rose-100" : 
                            isControlDisabled ? "stroke-slate-100" : "stroke-rose-100";
                          const fillColor = 
                            isExcellent ? "rgba(16, 185, 129, 0.05)" : 
                            isGreat ? "rgba(59, 130, 246, 0.05)" : 
                            isGood ? "rgba(245, 158, 11, 0.05)" : 
                            isFair ? "rgba(249, 115, 22, 0.05)" : 
                            isPoor ? "rgba(239, 68, 68, 0.05)" : "transparent";

                          const MAX_TIME = 10;
                          const progress = isVisualizing ? 1 : isControlDisabled ? 1 : (Math.max(0, Math.min(timeLeft, MAX_TIME)) / MAX_TIME);
                          return (
                            <CircularProgressRing
                              size={96}
                              viewBoxSize={92}
                              radius={36}
                              strokeWidth={5}
                              progress={progress}
                              trackClassName={cn(trackColor, "transition-colors duration-300")}
                              strokeClassName={strokeColor}
                              trackFill={fillColor}
                              transitionDuration={isVisualizing ? 0.3 : isControlDisabled ? 0 : (timeLeft === MAX_TIME ? 0 : 1)}
                              transitionEase={isVisualizing ? "easeOut" : "linear"}
                              className="select-none"
                            >
                              {isVisualizing ? (
                                <motion.div
                                  initial={{ scale: 0.5, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="flex flex-col items-center justify-center"
                                >
                                  <span className={cn(
                                    "text-[10px] font-black tracking-normal uppercase leading-none",
                                    isExcellent ? "text-emerald-600" :
                                    isGreat ? "text-blue-600" :
                                    isGood ? "text-amber-600" :
                                    isFair ? "text-orange-600" : "text-rose-600"
                                  )}>
                                    {isExcellent ? "Excellent" :
                                     isGreat ? "Great!" :
                                     isGood ? "Good!" :
                                     isFair ? "Fair" : "Poor"}
                                  </span>
                                </motion.div>
                              ) : isControlDisabled ? (
                                <>
                                  <span className="text-3xl font-black font-mono text-slate-300 leading-none">
                                    --
                                  </span>
                                  <div className="flex items-center gap-1 mt-0.5 text-slate-400">
                                    <MicOff size={10} className="text-slate-400" />
                                    <span className="text-[9px] font-black uppercase tracking-wider leading-none">WAIT</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span className="text-3xl font-black font-mono text-rose-600 leading-none">
                                    {timeLeft}
                                  </span>
                                  <div className="flex items-center gap-1 mt-0.5 text-rose-400">
                                    <Mic size={10} fill="currentColor" className="animate-pulse" />
                                    <span className="text-[9px] font-black uppercase tracking-wider leading-none">REC</span>
                                  </div>
                                </>
                              )}
                            </CircularProgressRing>
                          );
                        })()}

                        {(() => {
                          const isBtnDisabled = isControlDisabled || isSaving || assessmentVisualState !== 'idle';
                          return (
                            <div className="flex flex-col items-center gap-3 mt-2">
                              <button
                                type="button"
                                onClick={handleStopRecord}
                                disabled={isBtnDisabled}
                                className={cn(
                                  "flex items-center justify-center gap-2 px-6 py-3 rounded-2xl transition-all active:scale-[0.98] cursor-pointer shadow-sm w-48 group border-none",
                                  isBtnDisabled
                                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                    : "bg-rose-500 text-white hover:bg-rose-600"
                                )}
                                title="発話を完了して次へ"
                              >
                                <CheckCircle2 size={16} strokeWidth={2.5} className={cn(!isBtnDisabled && "group-hover:scale-110 transition-transform")} />
                                <span className="text-sm font-black tracking-wider">発話を完了</span>
                              </button>

                              <button
                                type="button"
                                onClick={handleSkipQuestion}
                                disabled={isBtnDisabled}
                                className={cn(
                                  "flex items-center justify-center gap-2 px-6 py-2 rounded-xl transition-all active:scale-[0.98] cursor-pointer w-48 border-none",
                                  isBtnDisabled
                                    ? "text-slate-200 cursor-not-allowed"
                                    : "text-slate-400 hover:text-slate-600"
                                )}
                                title="この問題をスキップして次へ"
                              >
                                <FastForward size={14} strokeWidth={2.5} />
                                <span className="text-[11px] font-bold uppercase tracking-wider">スキップする</span>
                              </button>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>

      <AudioResumeBanner status={resumeStatus} onResume={() => { unlockAudioContext(); }} />

      <ExitProcessingOverlay visible={exitLoading} />

      {/* 統合された完了レイヤー：結果先出しプレビュー＋自動進行プログレスバー型 */}
      {(isSaving || showTimeUpOverlay) && (
        <div
          className="absolute inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-in fade-in duration-300 cursor-pointer"
          onClick={showTimeUpOverlay ? handleGoToResult : undefined}
        >
          {/* shadcn Dialog相当：暗いスクリムの上に浮く独立したモーダルカード（裏のプレイ画面は透けて見える） */}
          <div className="w-full max-w-xs bg-white rounded-[32px] border border-white/60 shadow-2xl p-6 sm:p-7 text-center space-y-5 transform transition-all animate-in zoom-in-95 duration-300 ease-out">
            {/* アイコンはスピナー→チェックへ共有layoutIdで滑らかに変形させる */}
            <div className="relative w-16 h-16 mx-auto">
              <AnimatePresence mode="popLayout" initial={false}>
                {isSaving ? (
                  <motion.div
                    key="saving-icon"
                    layoutId="sprint-completion-icon"
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100 shadow-sm text-indigo-600"
                  >
                    <Loader2 className="w-7 h-7 animate-spin" strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="done-icon"
                    layoutId="sprint-completion-icon"
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100 shadow-sm text-indigo-600"
                  >
                    <CheckCircle2 className="w-7 h-7" strokeWidth={2.2} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">
                {isSaving ? "スプリントの記録を保存中" : "スプリント完了"}
              </h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-[220px] mx-auto">
                {isSaving ? "今回の成果を集計しています..." : "今回の成果はこちらです"}
              </p>
            </div>

            {/* 🆕 結果先出しスタッツプレビュー：保存API完了を待たず、確定済みの内訳をその場でカウントアップ表示する */}
            {previewStats && (
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 py-1 select-none">
                <StatPreviewTile
                  icon={CheckCircle2}
                  label="回答"
                  value={previewStats.answered}
                  active
                  color="text-indigo-500"
                />
                {previewStats.isAssessmentMode && (
                  <>
                    <StatPreviewTile
                      icon={Mic}
                      label="発話"
                      value={previewStats.assessments}
                      active
                      color="text-rose-500"
                    />
                    <StatPreviewTile
                      icon={ChartSpline}
                      label="平均スコア"
                      value={previewStats.assessments > 0 ? previewStats.avgScore : null}
                      suffix="/100"
                      active
                      color="text-amber-500"
                    />
                  </>
                )}
              </div>
            )}

            <div className={cn(
              "space-y-2.5 transition-all duration-500 transform",
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

              {/* 自動遷移の演出：テキストカウントダウンの代わりに薄い自動進行バーで示す */}
              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                {showTimeUpOverlay && (
                  <motion.div
                    key={resultId}
                    className="h-full bg-indigo-300 rounded-full"
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: 3.5, ease: 'linear' }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};