'use client';

import { useEffect, useCallback, useRef } from 'react';
import { setAudioSessionPlayback } from '../sprint/utils';
import { createChimeAudioBuffer, playChimeBuffer } from '../sprint/utils';

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

// デコード済みオーディオバッファのグローバルキャッシュ（画面遷移をまたいで再フェッチを防ぐ）
const audioBufferCache = new Map<string, AudioBuffer>();

/**
 * Sprint プレイヤー共通のオーディオリソースを管理するフック。
 *
 * ## 役割
 * - AudioContext と AudioBufferSourceNode を用いた高品質かつ安定した音声再生
 * - HTMLAudioElement の完全な排除による iOS WebKit 自動再生ロック問題の解消
 * - 再生中ソースノードの確実な追跡・停止 (stopTrack)
 *
 * @param stopListening useWebSpeech から受け取った stopListening 関数
 */
export function useSprintAudio(stopListening: () => void): UseSprintAudioReturn {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chimeBufferRef = useRef<AudioBuffer | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // ─── マウント時の初期化 / アンマウント時のクリーンアップ ────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 前画面からの残留を防ぐため、マウント時に強制的にスピーカー出力へ戻す
    setAudioSessionPlayback();

    // 前の認識インスタンスや TTS を強制停止して初期化
    stopListening();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // 再生用 AudioContext を生成
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

      // 再生中のソースノードがあれば停止
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch (_) {}
        currentSourceRef.current = null;
      }

      // AudioContext を閉じる
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => { /* no-op */ });
        audioCtxRef.current = null;
      }
    };
  }, [stopListening]);

  // ─── 音声再生停止 ────────────────────────────────────────────────────────
  const stopTrack = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (_) {}
      currentSourceRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // ─── iOS 自動再生ロック解除用 ──────────────────────────────────────────────
  const unlockAudioContext = useCallback(async () => {
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      try {
        await audioCtxRef.current.resume();
      } catch (e) {
        console.warn('Failed to resume AudioContext:', e);
      }
    }
  }, []);

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

      // 直前に再生中のソースがあれば停止
      stopTrack();

      if (audioPath && audioCtxRef.current) {
        const bucketUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${audioPath}`;
        const ctx = audioCtxRef.current;

        const startPlayback = (buffer: AudioBuffer) => {
          const run = () => {
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = opts.playbackRate ?? 1.0;

            const gainNode = ctx.createGain();
            gainNode.gain.value = 1.0;

            source.connect(gainNode);
            gainNode.connect(ctx.destination);

            currentSourceRef.current = source;

            source.onended = () => {
              if (currentSourceRef.current === source) {
                currentSourceRef.current = null;
              }
              resolve();
            };

            source.start(0);
          };

          if (ctx.state === 'suspended') {
            ctx.resume().then(run).catch(() => resolve());
          } else {
            run();
          }
        };

        // キャッシュチェック、存在しなければ取得とデコード
        const cached = audioBufferCache.get(bucketUrl);
        if (cached) {
          startPlayback(cached);
        } else {
          fetch(bucketUrl)
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
              return res.arrayBuffer();
            })
            .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
            .then((decodedBuffer) => {
              audioBufferCache.set(bucketUrl, decodedBuffer);
              startPlayback(decodedBuffer);
            })
            .catch((err) => {
              console.warn('Audio Context decode error, fallback resolve:', err);
              resolve(); // エラー時も停止せずに処理を進める
            });
        }
      } else {
        // audioPath が null の場合は即時スキップ
        resolve();
      }
    });
  }, [stopTrack]);

  // ─── チャイム再生 ─────────────────────────────────────────────────────────
  const playChime = useCallback((): Promise<void> => {
    // iOS環境の場合はオーディオ競合（ハング・エコーキャンセラー暴走）を防ぐためチャイム再生を抑止
    const isMobileIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobileIOS) {
      return Promise.resolve();
    }

    if (!audioCtxRef.current || !chimeBufferRef.current) return Promise.resolve();
    return playChimeBuffer(audioCtxRef.current, chimeBufferRef.current);
  }, []);

  return {
    audioCtxRef,
    chimeBufferRef,
    playTrack,
    playChime,
    stopTrack,
    unlockAudioContext,
  };
}
