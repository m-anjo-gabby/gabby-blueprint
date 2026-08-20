'use client';

import { useCallback } from 'react';
import { useAudioEngine } from './useAudioEngine';

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
   * - audioPath が null の場合は即時 resolve
   * - exitLoading が true の場合も即時 resolve（終了処理中の再生防止）
   * @param text 読み上げテキスト（現在はフォールバック用・未使用）
   * @param audioPath Supabase Storage の相対パス
   * @param opts.playbackRate 再生速度（デフォルト 1.0）
   * @param opts.exitLoading true の場合は即時 resolve して再生しない
   */
  playTrack: (
    text: string,
    audioPath: string | null,
    opts?: { playbackRate?: number; exitLoading?: boolean },
  ) => Promise<void>;
  /** チャイム音を AudioContext 経由で再生する */
  playChime: () => Promise<void>;
  /** 現在再生中の音声トラックを即時停止する */
  stopTrack: () => void;
  /** iOSの自動再生制限ロックを解除するためにユーザーインタラクション時に呼び出す */
  unlockAudioContext: () => Promise<void>;
}

/**
 * Sprint プレイヤー（Drill/Time）共通のオーディオリソースを管理するフック。
 * 内部的には `useAudioEngine` の薄いラッパーであり、以下の挙動を維持している:
 * - 再生開始を150ms遅延させる（iOSのマイク停止音フェードアウト待ち）
 * - unmount時にAudioContextを明示的にcloseする
 * - suspended状態からの復旧は単純なresume()のみ（強制再生成リカバリは行わない）
 *
 * @param stopListening useWebSpeech から受け取った stopListening 関数
 */
export function useSprintAudio(stopListening: () => void): UseSprintAudioReturn {
  const engine = useAudioEngine({
    stopListening,
    startDelayMs: 150,
    closeOnUnmount: true,
    useSuspendedRecovery: false,
    stopBeforeChime: false,
    urlResolution: 'concat',
  });

  const playTrack = useCallback((
    _text: string,
    audioPath: string | null,
    opts: { playbackRate?: number; exitLoading?: boolean } = {},
  ): Promise<void> => {
    return engine.play(audioPath, { playbackRate: opts.playbackRate ?? 1.0, skip: opts.exitLoading });
  }, [engine]);

  return {
    audioCtxRef: engine.audioCtxRef,
    chimeBufferRef: engine.chimeBufferRef,
    playTrack,
    playChime: engine.playChime,
    stopTrack: engine.stop,
    unlockAudioContext: engine.unlock,
  };
}
