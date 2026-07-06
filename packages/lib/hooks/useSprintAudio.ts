'use client';

import { useEffect, useCallback, useRef } from 'react';
import { setAudioSessionPlayback } from '../sprint/utils';
import { createChimeAudioBuffer, playChimeBuffer } from '../sprint/utils';

/**
 * `useSprintAudio` の戻り値
 */
export interface UseSprintAudioReturn {
  /** 使い回す HTMLAudioElement インスタンス（iOS 自動再生ポリシー回避） */
  nativeAudioRef: React.RefObject<HTMLAudioElement | null>;
  /** チャイム再生専用の AudioContext */
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
}

/**
 * Sprint プレイヤー共通のオーディオリソースを管理するフック。
 *
 * ## 役割
 * - SprintDrillPlayer / SprintTimePlayer の重複していたマウント/アンマウント処理を統合
 * - nativeAudio インスタンスの生成・停止・破棄
 * - チャイム用 AudioContext の生成・バッファ事前デコード・破棄
 * - setAudioSessionPlayback による iOS WebKit 受話器モード防止
 *
 * ## 設計上の注意
 * - このフックは `stopListening`（useWebSpeech）を引数に受け取る。
 *   マウント/アンマウント時に必ず `stopListening()` を呼ぶことで、
 *   前の画面から残留した認識インスタンスを確実に破棄する。
 *
 * @param stopListening useWebSpeech から受け取った stopListening 関数
 */
export function useSprintAudio(stopListening: () => void): UseSprintAudioReturn {
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chimeBufferRef = useRef<AudioBuffer | null>(null);

  // ─── マウント時の初期化 / アンマウント時のクリーンアップ ────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // iOSの自動再生ポリシー回避のため、単一の Audio インスタンスをマウント時に生成して使い回す
    nativeAudioRef.current = new Audio();
    nativeAudioRef.current.volume = 1.0;

    // 前画面からの残留を防ぐため、マウント時に強制的にスピーカー出力へ戻す
    setAudioSessionPlayback();

    // 前の認識インスタンスや TTS を強制停止して初期化
    stopListening();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // チャイム用 AudioContext を生成（nativeAudio の src 切り替えと完全に独立したチャンネル）
    const AudioContextClass =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass() as AudioContext;
      audioCtxRef.current = ctx;

      // チャイム音を事前デコード（共通ヘルパーを利用）
      createChimeAudioBuffer(ctx)
        .then((buffer) => {
          chimeBufferRef.current = buffer;
        })
        .catch((e: unknown) => {
          console.warn('Chime pre-render failed:', e);
        });
    }

    return () => {
      // アンマウント時にも確実にスピーカー出力へ戻し、マイクを強制クリーンアップ
      setAudioSessionPlayback();
      stopListening();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      // 再生中の Audio インスタンスを停止・破棄
      if (nativeAudioRef.current) {
        nativeAudioRef.current.pause();
        nativeAudioRef.current = null;
      }

      // AudioContext を閉じる
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => { /* no-op */ });
        audioCtxRef.current = null;
      }
    };
    // stopListening は useWebSpeech の useCallback で安定しているため deps に含めて問題なし
  }, [stopListening]);

  // ─── 音声ファイル再生 ────────────────────────────────────────────────────
  const playTrack = useCallback((
    _text: string,
    audioPath: string | null,
    opts: { playbackRate?: number; exitLoading?: boolean } = {},
  ): Promise<void> => {
    return new Promise((resolve) => {
      // 終了処理中は再生を一切行わずに即時終了する
      if (opts.exitLoading) {
        resolve();
        return;
      }

      // 直前に再生中のインスタンスがあれば停止（src 切り替え時のプチプチノイズを防ぐ）
      if (nativeAudioRef.current) {
        nativeAudioRef.current.pause();
        nativeAudioRef.current.onended = null;
        nativeAudioRef.current.onerror = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      if (audioPath && nativeAudioRef.current) {
        const bucketUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${audioPath}`;
        const audio = nativeAudioRef.current;

        const cleanupAndResolve = () => {
          audio.onended = null;
          audio.onerror = null;
          audio.pause();
          try {
            // リソースを空にしてアンロードし、iOSのオーディオセッションロックを確実に解除する
            audio.src = '';
            audio.load();
          } catch (_) {}
          resolve();
        };

        audio.src = bucketUrl;
        audio.playbackRate = opts.playbackRate ?? 1.0;
        audio.onended = cleanupAndResolve;
        audio.onerror = cleanupAndResolve; // エラー時は即時スキップ
        
        audio.play().catch((err) => {
          console.warn('Audio play failed, skipping:', err);
          cleanupAndResolve();
        });
      } else {
        // audioPath が null の場合は即時スキップ
        resolve();
      }
    });
  }, []);

  // ─── チャイム再生 ─────────────────────────────────────────────────────────
  const playChime = useCallback((): Promise<void> => {
    // 🚀 iOS環境の場合はオーディオ競合（ハング・エコーキャンセラー暴走）を防ぐためチャイム再生を抑止
    const isMobileIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobileIOS) {
      return Promise.resolve();
    }

    if (!audioCtxRef.current || !chimeBufferRef.current) return Promise.resolve();
    return playChimeBuffer(audioCtxRef.current, chimeBufferRef.current);
  }, []);

  return {
    nativeAudioRef,
    audioCtxRef,
    chimeBufferRef,
    playTrack,
    playChime,
  };
}
