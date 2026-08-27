'use client';

import { useCallback } from 'react';
import { useAudioEngine, AudioResumeStatus } from './useAudioEngine';

/**
 * `useSprintAudio` の戻り値
 */
export interface UseSprintAudioReturn {
  /** チャイムおよびトラック再生用の AudioContext */
  audioCtxRef: React.RefObject<AudioContext | null>;
  /** 事前デコード済みチャイム AudioBuffer */
  chimeBufferRef: React.RefObject<AudioBuffer | null>;
  /**
   * オーディオファイルを再生する Promise。
   * - audioPath が null の場合は即時 resolve（onError が呼ばれる）
   * - exitLoading が true の場合も即時 resolve（終了処理中の再生防止）
   * - 代替読み上げ（TTSフォールバック）は行わない。再生できない場合は
   *   opts.onError を通じて呼び出し元に通知するのみ。
   * @param text 読み上げテキスト（onError発火時のログ用コンテキスト）
   * @param audioPath Supabase Storage の相対パス
   * @param opts.playbackRate 再生速度（デフォルト 1.0）
   * @param opts.exitLoading true の場合は即時 resolve して再生しない
   * @param opts.onError 音声ファイルが無い/取得・デコードに失敗した場合に呼ばれる
   */
  playTrack: (
    text: string,
    audioPath: string | null,
    opts?: { playbackRate?: number; exitLoading?: boolean; onError?: (error: unknown) => void },
  ) => Promise<void>;
  /** チャイム音を AudioContext 経由で再生する */
  playChime: () => Promise<void>;
  /** 現在再生中の音声トラックを即時停止する */
  stopTrack: () => void;
  /** iOSの自動再生制限ロックを解除するためにユーザーインタラクション時に呼び出す */
  unlockAudioContext: () => Promise<void>;
  /** 音声再開の状態。'needsResume'/'failed' に応じて通知UIを出し分ける */
  resumeStatus: AudioResumeStatus;
}

/**
 * Sprint プレイヤー（Drill/Time）共通のオーディオリソースを管理するフック。
 * 内部的には `useAudioEngine` の薄いラッパーであり、以下の挙動を維持している:
 * - 再生開始を150ms遅延させる（iOSのマイク停止音フェードアウト待ち）
 * - unmount時にAudioContextを明示的にcloseする
 * - suspended/interrupted状態からの復旧はresume→タイムアウト付き再生成の
 *   ハイブリッド戦略で行う（usePlayAudioSpeechと共通。useAudioEngine参照）
 *
 * @param stopListening useWebSpeech から受け取った stopListening 関数
 */
export function useSprintAudio(stopListening: () => void): UseSprintAudioReturn {
  const engine = useAudioEngine({
    stopListening,
    startDelayMs: 150,
    closeOnUnmount: true,
    stopBeforeChime: false,
    urlResolution: 'concat',
  });

  const playTrack = useCallback((
    _text: string,
    audioPath: string | null,
    opts: { playbackRate?: number; exitLoading?: boolean; onError?: (error: unknown) => void } = {},
  ): Promise<void> => {
    return engine.play(audioPath, {
      playbackRate: opts.playbackRate ?? 1.0,
      skip: opts.exitLoading,
      onError: opts.onError,
    });
  }, [engine]);

  return {
    audioCtxRef: engine.audioCtxRef,
    chimeBufferRef: engine.chimeBufferRef,
    playTrack,
    playChime: engine.playChime,
    stopTrack: engine.stop,
    unlockAudioContext: engine.unlock,
    resumeStatus: engine.resumeStatus,
  };
}
