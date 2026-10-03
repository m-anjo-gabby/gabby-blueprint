'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '@gabby/types/speechAssessment';
import { useAudioEngine, type AudioEngineOptions, type AudioEnginePlayOptions } from '../../hooks/useAudioEngine';
import { requestPlayAndRecordSession } from '../core/audioSession';
import { startSpeechAssessment, type SpeechAssessmentHandle } from '../core/speechAssessment';
import { waitFor, type PlayPromptsResult, type PromptFailure, type SpeakingPrompt, type SpeakingTurnResult } from '../core/flow';
import { cancelSpeech } from '../../speech/synthesis';

export interface ListenOptions {
  targetText: string;
  mainWords: string[];
  signal: AbortSignal;
  /** 認識の前に開始チャイムを鳴らし、鳴り終わるのを待つ（既定: true） */
  chime?: boolean;
  /** 実際にマイクが開いた（録音インジケータの表示タイミング） */
  onListening?: () => void;
}

export interface PlayPromptsOptions<K extends string> {
  signal: AbortSignal;
  /** 音声と音声の間の待ち時間（ms） */
  gapMs?: number;
  /** 各音声の再生を始める直前（画面の表示切替用） */
  onPrompt?: (key: K) => void;
  /** 音声を再生できなかった（通知・ログ用。再生は続ける） */
  onPromptError?: (failure: PromptFailure<K>) => void;
}

export interface RunTurnOptions<K extends string> extends PlayPromptsOptions<K> {
  prompts: SpeakingPrompt<K>[];
  /** 音声の再生が終わり、回答の段階に入った */
  onAnswerPhase?: () => void;
  /** 回答の段階に入ってからチャイムまでの待ち時間（ms） */
  preChimeGapMs?: number;
  /** 発話評価の設定。null の場合は録音せず、回答の段階に入った時点で終える（脳内回答） */
  assessment: Omit<ListenOptions, 'signal'> | null;
}

/**
 * 単語帳ドリル・スプリント共通の「再生 → 発話」プレイヤー。
 *
 * - 再生は `useAudioEngine`（アプリ全体で1つの AudioContext）、評価は `audio/core/speechAssessment`。
 * - 流れ（音声の連続再生・待ち・チャイム・認識）は beginFlow() で受け取った AbortSignal で中断する。
 *   新しい流れを始める・stopAll() を呼ぶと、前の流れは待ち・再生・認識のどこにいても止まる。
 * - 発話の終わらせ方は2つ: finishListening()（その時点の評価で確定）と、中断（結果なし）。
 * - 発話の順番は「チャイムが鳴り終わってから認識を開始」で統一する（旧スピーキングテスト S172 と同じ）。
 */
export function useSpeakingPlayer(engineOptions: AudioEngineOptions) {
  const engine = useAudioEngine(engineOptions);
  const { play: enginePlay, stop: engineStop, playChime, setLiveRate } = engine;

  const [isListening, setIsListening] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const playbackRateRef = useRef(1.0);

  const flowRef = useRef<AbortController | null>(null);
  const assessmentRef = useRef<SpeechAssessmentHandle | null>(null);
  // 発話の世代番号。評価のコールバックは開始処理の途中（戻り値の代入前）からも呼ばれるため、
  // 戻り値ではなくこの番号で「今の発話か」を判定する
  const listenIdRef = useRef(0);

  const abortAssessment = useCallback(() => {
    listenIdRef.current += 1;
    assessmentRef.current?.abort();
    assessmentRef.current = null;
    setIsListening(false);
    setTimeLeft(0);
  }, []);

  /** 新しい流れを始める（前の流れは中断する）。返した signal を流れの中の待ち・再生・認識に渡す */
  const beginFlow = useCallback((): AbortSignal => {
    flowRef.current?.abort();
    const controller = new AbortController();
    flowRef.current = controller;
    return controller.signal;
  }, []);

  /**
   * 進行中の流れの signal を返す（無ければ新しく始める）。前の流れを中断せずに続きの処理を足す場合に使う
   * （例: 発話の評価が出た後の解答再生）。次の beginFlow() / stopAll() で一緒に中断される。
   */
  const currentFlow = useCallback((): AbortSignal => {
    const active = flowRef.current;
    if (active && !active.signal.aborted) return active.signal;
    return beginFlow();
  }, [beginFlow]);

  /** 再生・待ち・チャイム・認識をすべて止める（認識の結果は出さない） */
  const stopAll = useCallback(() => {
    flowRef.current?.abort();
    flowRef.current = null;
    abortAssessment();
    engineStop();
    cancelSpeech();
  }, [abortAssessment, engineStop]);

  /** 発話をその時点の評価で確定する（停止ボタン・タイムアップ等） */
  const finishListening = useCallback(() => {
    assessmentRef.current?.finish();
  }, []);

  useEffect(() => () => {
    flowRef.current?.abort();
    assessmentRef.current?.abort();
  }, []);

  const changePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    playbackRateRef.current = rate;
    setLiveRate(rate);
  }, [setLiveRate]);

  /** 1つの音声を再生する（再生速度は changePlaybackRate の値） */
  const play = useCallback((path: string | null, opts: AudioEnginePlayOptions = {}) => {
    return enginePlay(path, { playbackRate: playbackRateRef.current, ...opts });
  }, [enginePlay]);

  /** 音声を順番に再生する。中断されたら残りは再生しない */
  const playPrompts = useCallback(async <K extends string>(
    prompts: SpeakingPrompt<K>[],
    { signal, gapMs = 0, onPrompt, onPromptError }: PlayPromptsOptions<K>,
  ): Promise<PlayPromptsResult<K>> => {
    const failures: PromptFailure<K>[] = [];
    const stopOnAbort = () => engineStop();
    signal.addEventListener('abort', stopOnAbort, { once: true });
    try {
      for (let i = 0; i < prompts.length; i++) {
        if (signal.aborted) return { aborted: true, failures };
        const prompt = prompts[i];
        onPrompt?.(prompt.key);
        if (prompt.text) {
          const outcome: { failed: boolean; error: unknown } = { failed: false, error: null };
          await play(prompt.audioPath, { onError: (e) => { outcome.failed = true; outcome.error = e; } });
          if (signal.aborted) return { aborted: true, failures };
          if (outcome.failed) {
            const failure = { prompt, error: outcome.error };
            failures.push(failure);
            onPromptError?.(failure);
          }
        }
        if (i < prompts.length - 1 && !(await waitFor(gapMs, signal))) {
          return { aborted: true, failures };
        }
      }
      return { aborted: signal.aborted, failures };
    } finally {
      signal.removeEventListener('abort', stopOnAbort);
    }
  }, [play, engineStop]);

  /** チャイム → 認識・評価。中断された場合は null */
  const listen = useCallback(async ({ targetText, mainWords, signal, chime = true, onListening }: ListenOptions): Promise<AnalysisResult | null> => {
    if (signal.aborted) return null;
    abortAssessment();

    // マイクを使う前に録音再生モードへ（発話セッション中は、以降画面を離れるまで戻さない）
    requestPlayAndRecordSession();

    if (chime) {
      await playChime();
      if (signal.aborted) return null;
    }

    const listenId = ++listenIdRef.current;
    const isCurrent = () => listenIdRef.current === listenId;
    const handle = startSpeechAssessment({
      targetText,
      mainWords,
      onListening: () => {
        if (!isCurrent()) return;
        setIsListening(true);
        onListening?.();
      },
      onTimeLeft: (seconds) => {
        if (isCurrent()) setTimeLeft(seconds);
      },
    });
    assessmentRef.current = handle;

    const onAbort = () => handle.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const result = await handle.result;
    signal.removeEventListener('abort', onAbort);

    if (isCurrent()) {
      assessmentRef.current = null;
      setIsListening(false);
      setTimeLeft(0);
    }
    return signal.aborted ? null : result;
  }, [abortAssessment, playChime]);

  /** 1回分の発話: 音声を順番に再生 → 回答の段階 → （評価ありなら）チャイム → 認識・評価 */
  const runTurn = useCallback(async <K extends string>({
    prompts,
    assessment,
    preChimeGapMs = 0,
    onAnswerPhase,
    ...promptOptions
  }: RunTurnOptions<K>): Promise<SpeakingTurnResult<AnalysisResult, K>> => {
    const { signal } = promptOptions;
    const played = await playPrompts(prompts, promptOptions);
    if (played.aborted) return { status: 'aborted' };
    if (played.failures.length > 0) return { status: 'promptFailed', failures: played.failures };

    onAnswerPhase?.();
    if (!assessment) return { status: 'answered', result: null };

    if (!(await waitFor(preChimeGapMs, signal))) return { status: 'aborted' };
    const result = await listen({ ...assessment, signal });
    if (result === null) return { status: 'aborted' };
    return { status: 'answered', result };
  }, [playPrompts, listen]);

  return {
    beginFlow,
    currentFlow,
    stopAll,
    play,
    playPrompts,
    listen,
    runTurn,
    finishListening,
    isListening,
    timeLeft,
    playbackRate,
    changePlaybackRate,
    playChime,
    stopPlayback: engineStop,
    preload: engine.preload,
    unlock: engine.unlock,
    isPlaying: engine.isPlaying,
    resumeStatus: engine.resumeStatus,
  };
}

export type SpeakingPlayer = ReturnType<typeof useSpeakingPlayer>;
