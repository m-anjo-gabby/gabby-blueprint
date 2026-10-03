'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { createBrowserClient } from '../supabase/client';
import {
  createAudioOwnerId,
  hasCachedAudioBuffer,
  loadAudioBuffer,
  playAudioClip,
  playChimeSound,
  prepareChime,
  setAudioClipRate,
  stopAudioClip,
  unlockAudio,
  type AudioResumeStatus,
} from '../audio/core/audioRuntime';
import { requestPlaybackSession } from '../audio/core/audioSession';
import { useAudioResumeStatus } from '../audio/react/useAudioResumeStatus';
import { cancelSpeech } from '../speech/synthesis';

export type { AudioResumeStatus };

/**
 * 音声再生の共通基盤（`usePlayAudioSpeech` / `audio/react/useSpeakingPlayer` が使う）。
 *
 * AudioContext・デコード済み音声・チャイム・再生中のクリップ・音声再開の状態は
 * アプリ全体で1つの `audio/core/audioRuntime` が持ち、このフックはその窓口に徹する
 * （フックごとに AudioContext を作らない・閉じない・自動で作り直さない）。
 * iOS のオーディオセッションの切り替えは `audio/core/audioSession` だけが行う。
 */
export interface AudioEngineOptions {
  /** decodeAudioDataにタイムアウトを設けるか（ms）。未指定はタイムアウトなし */
  decodeTimeoutMs?: number;
  /** チャイム再生前に、再生中のトラックを停止するか */
  stopBeforeChime?: boolean;
  /** 再生URLの解決方法。'concat' = 環境変数から手動組み立て / 'sdk' = supabase.storage.getPublicUrl */
  urlResolution: 'concat' | 'sdk';
}

export interface AudioEnginePlayOptions {
  /** 再生アイテムの識別子。指定した場合のみ isPlaying 追跡・同一id再タップでのトグル停止が有効になる */
  id?: string;
  playbackRate?: number;
  /** 同一idを再タップした際、トグル停止ではなく最初から再生し直す */
  restart?: boolean;
  /** trueの場合、一切再生せず即座に解決する（終了処理中の再生防止用） */
  skip?: boolean;
  bucketName?: string;
  /**
   * 音声ファイルの取得・デコードに失敗した場合に呼ばれる。
   * 呼び出し側での代替読み上げ（TTSフォールバック）は廃止したため、
   * ログ記録やユーザーへの通知は呼び出し元がこのコールバックで行う。
   */
  onError?: (error: unknown) => void;
}

export interface UseAudioEngineReturn {
  play: (path: string | null, opts?: AudioEnginePlayOptions) => Promise<void>;
  playChime: () => Promise<void>;
  stop: () => void;
  unlock: () => Promise<void>;
  preload: (path: string, opts?: { bucketName?: string }) => Promise<void>;
  /** 再生中に再生速度をライブ変更する（現在再生中のソースがあれば即時反映） */
  setLiveRate: (rate: number) => void;
  isPlaying: string | null;
  /** 音声再開の状態。呼び出し側はこの値に応じて通知UIを出し分ける */
  resumeStatus: AudioResumeStatus;
}

export function useAudioEngine(opts: AudioEngineOptions): UseAudioEngineReturn {
  const {
    decodeTimeoutMs,
    stopBeforeChime = false,
    urlResolution,
  } = opts;

  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const resumeStatus = useAudioResumeStatus();

  const [ownerId] = useState(createAudioOwnerId);
  const currentPlayingIdRef = useRef<string | null>(null);
  // play/stop のたびに進める世代番号。取得・デコードの待ち中に停止や別の再生があったかを判定する
  const playTokenRef = useRef(0);
  const supabaseRef = useRef(urlResolution === 'sdk' ? createBrowserClient() : null);

  // ─── マウント時の初期化 / アンマウント時のクリーンアップ ────────────────
  // AudioContext は共有のため閉じない。このフックが鳴らしているクリップだけを止める。
  useEffect(() => {
    requestPlaybackSession();
    cancelSpeech();
    prepareChime();

    return () => {
      requestPlaybackSession();
      cancelSpeech();
      playTokenRef.current += 1;
      stopAudioClip(ownerId);
      currentPlayingIdRef.current = null;
    };
  }, [ownerId]);

  const stop = useCallback(() => {
    playTokenRef.current += 1;
    stopAudioClip(ownerId);
    cancelSpeech();
    setIsPlaying(null);
    currentPlayingIdRef.current = null;
  }, [ownerId]);

  const unlock = useCallback(() => unlockAudio(), []);

  const resolveUrl = useCallback((path: string, bucketName?: string): string => {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (urlResolution === 'sdk' && supabaseRef.current) {
      const { data } = supabaseRef.current.storage.from(bucketName || 'audio').getPublicUrl(path);
      return data.publicUrl;
    }
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucketName || 'audio'}/${path}`;
  }, [urlResolution]);

  const play = useCallback(async (path: string | null, playOpts: AudioEnginePlayOptions = {}): Promise<void> => {
    const { id, playbackRate = 1.0, restart, skip, bucketName, onError } = playOpts;

    if (skip) return;

    // 同一idの再タップ（restart指定なし）はトグル停止扱い。idが未指定の呼び出し（スプリントの問題音声等）は
    // このトグル判定自体を行わず、常に新規再生として扱う。
    if (id !== undefined && currentPlayingIdRef.current === id && !restart) {
      stop();
      return;
    }

    // 取得・デコード中に前の音声が鳴り続けないよう、先に止める
    const token = ++playTokenRef.current;
    stopAudioClip();

    if (!path) {
      currentPlayingIdRef.current = null;
      setIsPlaying(null);
      onError?.(new Error('No audio path provided'));
      return;
    }

    const playingId = id ?? null;
    currentPlayingIdRef.current = playingId;

    let buffer: AudioBuffer;
    try {
      buffer = await loadAudioBuffer(resolveUrl(path, bucketName), { decodeTimeoutMs });
    } catch (err) {
      console.warn('Audio fetch/decode error:', err);
      if (playTokenRef.current === token) {
        currentPlayingIdRef.current = null;
        setIsPlaying(null);
      }
      onError?.(err);
      return;
    }

    // 取得中に停止・別の音声の再生が行われていたら、この再生は取りやめる
    if (playTokenRef.current !== token) return;

    await playAudioClip(buffer, {
      ownerId,
      playbackRate,
      onStart: () => {
        if (id !== undefined) setIsPlaying(id);
      },
    });

    if (playTokenRef.current === token) {
      currentPlayingIdRef.current = null;
      if (id !== undefined) setIsPlaying(null);
    }
  }, [ownerId, resolveUrl, stop, decodeTimeoutMs]);

  const playChime = useCallback(async (): Promise<void> => {
    if (stopBeforeChime) stop();
    await playChimeSound();
  }, [stopBeforeChime, stop]);

  const preload = useCallback(async (path: string, preloadOpts?: { bucketName?: string }) => {
    if (!path) return;
    const url = resolveUrl(path, preloadOpts?.bucketName);
    if (hasCachedAudioBuffer(url)) return;
    try {
      await loadAudioBuffer(url);
    } catch { /* no-op */ }
  }, [resolveUrl]);

  const setLiveRate = useCallback((rate: number) => {
    setAudioClipRate(rate);
  }, []);

  return { play, playChime, stop, unlock, preload, setLiveRate, isPlaying, resumeStatus };
}
