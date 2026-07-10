// packages/lib/hooks/usePlayAudioSpeech.ts
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createBrowserClient } from '../supabase/client';
import { audioBufferCache, createChimeAudioBuffer, playChimeBuffer } from '../sprint/utils';

interface NavigatorWithAudioSession extends Navigator {
  audioSession?: {
    type: 'playback' | 'play-and-record';
  };
}

/**
 * 音声再生およびダウンロードを管理するカスタムフック
 * AudioContext と AudioBufferSourceNode を利用して HTMLAudioElement の依存を完全に排除
 */
export function usePlayAudioSpeech() {
  // 現在再生中のアイテムID（phrase_idなど、チャイムは '__chime__' を使用可能）
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  // 現在ダウンロード処理中のアイテムID
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  // 再生速度の状態（UI表示用：デフォルトは 1.0）
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  
  // 再生制御用の最新値を保持
  const currentPlayingIdRef = useRef<string | null>(null);
  const playbackRateRef = useRef<number>(1.0);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  // 【追加】事前デコード済みチャイム AudioBuffer の保持用
  const chimeBufferRef = useRef<AudioBuffer | null>(null);
  // グローバルキャッシュを使用（画面を行き来してもバッファが維持される）
  
  const supabase = createBrowserClient();

  /**
   * iOS対策: 結果画面において放置されて完全にフリーズしたAudioContextを安全に取得・破棄・再生成する
   */
  const getOrInitializeAudioContext = useCallback(async (): Promise<AudioContext | null> => {
    if (typeof window === 'undefined') return null;

    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (audioCtxRef.current && audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = null;
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextClass() as AudioContext;
    }

    let ctx = audioCtxRef.current;

    // 放置されてサスペンドした状態を解決
    if (ctx && ctx.state === 'suspended') {
      try {
        // iOS特有の、resume()自体のPromiseが戻ってこなくなるデッドロックを0.5秒でタイムアウト回避
        const resumeWithTimeout = Promise.race([
          ctx.resume(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("AudioContext resume timeout")), 500))
        ]);

        await resumeWithTimeout;

        // 依然ロックされている場合は強制的に別インスタンスへスクラップ＆ビルド
        if (ctx.state === 'suspended') {
          console.warn("AudioContext locked on iOS Result screen. Re-creating instance...");
          ctx.close().catch(() => {});
          audioCtxRef.current = new AudioContextClass() as AudioContext;
          ctx = audioCtxRef.current;
          await ctx.resume();
        }
      } catch (e) {
        console.warn("Failed or timed out resuming AudioContext. Force recreating...", e);
        try { ctx.close().catch(() => {}); } catch (_) {}
        audioCtxRef.current = new AudioContextClass() as AudioContext;
        ctx = audioCtxRef.current;
        try { await ctx.resume(); } catch (_) {}
      }
    }

    return audioCtxRef.current;
  }, []);

  // 【追加】初期化時にチャイム音をバックグラウンドで事前デコード
  useEffect(() => {
    async function initChime() {
      const ctx = await getOrInitializeAudioContext();
      if (!ctx) return;
      try {
        const buffer = await createChimeAudioBuffer(ctx);
        chimeBufferRef.current = buffer;
      } catch (e) {
        console.warn('Word Chime pre-render failed:', e);
      }
    }
    initChime();
  }, [getOrInitializeAudioContext]);

  /**
   * 現在の再生音声を強制停止する内部共通メソッド
   */
  const stop = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (_) {}
      currentSourceRef.current = null;
    }
    setIsPlaying(null);
    currentPlayingIdRef.current = null;
  }, []);

  /**
   * 【追加】チャイム音を AudioContext 経由で再生する
   */
  const playChime = useCallback(async (): Promise<void> => {
    const ctx = await getOrInitializeAudioContext();
    const buffer = chimeBufferRef.current;

    if (!ctx || !buffer) return;

    try {
      // 再生直前に状態を同期
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      // 既存のトラック再生があれば停止
      stop();

      // 共通ヘルパーを利用してチャイムを再生
      await playChimeBuffer(ctx, buffer);
    } catch (e) {
      console.warn('iOS AudioContext chime playback failed or interrupted:', e);
    }
  }, [getOrInitializeAudioContext, stop]);

  /**
   * 【追加】iOSの自動再生制限ロックを解除するためにユーザーインタラクション時に明示的に呼び出せるようにする
   */
  const unlockAudioContext = useCallback(async () => {
    const ctx = await getOrInitializeAudioContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn('Failed to resume AudioContext from interaction:', e);
      }
    }
  }, [getOrInitializeAudioContext]);

  /**
   * 音声を再生する (結果画面のシーケンス制御に最適化したPromise仕様)
   * @param path - Supabase Storage内の相対パス
   * @param id - アイテムを一意に識別するID
   * @param options - 再生オプション (restart: true の場合、同じIDでも最初から再生)
   */
  const play = useCallback(async (path: string, id: string, options?: { restart?: boolean }): Promise<void> => {
    const ctx = await getOrInitializeAudioContext();
    if (!ctx) return;

    // 同じIDがクリックされた場合
    if (currentPlayingIdRef.current === id) {
      if (!options?.restart) {
        stop();
        return;
      }
    }

    // 他の再生中の音声を停止
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (_) {}
      currentSourceRef.current = null;
    }

    if (!path) {
      setIsPlaying(null);
      currentPlayingIdRef.current = null;
      return;
    }

    const { data } = supabase.storage.from('audio').getPublicUrl(path);
    const bucketUrl = data.publicUrl;

    return new Promise<void>((resolve) => {
      const startPlayback = (buffer: AudioBuffer) => {
        const run = () => {
          if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            resolve();
            return;
          }
          
          const source = audioCtxRef.current.createBufferSource();
          source.buffer = buffer;
          source.playbackRate.value = playbackRateRef.current;

          const gainNode = audioCtxRef.current.createGain();
          gainNode.gain.value = 1.0;

          source.connect(gainNode);
          gainNode.connect(audioCtxRef.current.destination);

          currentSourceRef.current = source;
          currentPlayingIdRef.current = id;
          setIsPlaying(id);

          const clearState = () => {
            if (currentPlayingIdRef.current === id) {
              setIsPlaying(null);
              currentPlayingIdRef.current = null;
            }
            if (currentSourceRef.current === source) {
              currentSourceRef.current = null;
            }
            resolve();
          };

          source.onended = clearState;
          
          try {
            source.start(0);
          } catch (err) {
            console.error("AudioSource start error:", err);
            clearState();
          }
        };

        if (ctx.state === 'suspended') {
          ctx.resume().then(run).catch(() => {
            setIsPlaying(null);
            currentPlayingIdRef.current = null;
            resolve();
          });
        } else {
          run();
        }
      };

      const cached = audioBufferCache.get(bucketUrl);
      if (cached) {
        startPlayback(cached);
      } else {
        fetch(bucketUrl)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
            return res.arrayBuffer();
          })
          .then((arrayBuffer) => {
            if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
              throw new Error("AudioContext was closed during fetch");
            }
            // decode自体のフリーズバグを回避するためタイムアウト付きで安全デコード
            return Promise.race([
              audioCtxRef.current.decodeAudioData(arrayBuffer),
              new Promise<AudioBuffer>((_, reject) => setTimeout(() => reject(new Error("decodeAudioData timeout")), 1000))
            ]);
          })
          .then((decodedBuffer) => {
            audioBufferCache.set(bucketUrl, decodedBuffer);
            startPlayback(decodedBuffer);
          })
          .catch((err) => {
            console.error("Audio Context decode error:", err);
            setIsPlaying(null);
            currentPlayingIdRef.current = null;
            resolve(); // フリーズしても呼び出し元の連続ループがスタックしないよう確実に解決して次に流す
          });
      }
    });
  }, [supabase, getOrInitializeAudioContext, stop]);

  /**
   * 音声をプリロード（先読み）する
   * @param path - Supabase Storage内の相対パス
   */
  const preload = useCallback(async (path: string) => {
    if (!path) return;
    const ctx = await getOrInitializeAudioContext();
    if (!ctx) return;

    const { data } = supabase.storage.from('audio').getPublicUrl(path);
    const bucketUrl = data.publicUrl;

    if (!audioBufferCache.has(bucketUrl)) {
      try {
        const res = await fetch(bucketUrl);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          audioBufferCache.set(bucketUrl, decoded);
        }
      } catch (_) {}
    }
  }, [supabase, getOrInitializeAudioContext]);

  /**
   * 再生速度を変更する
   * @param rate - 再生速度 (0.5 ~ 2.0)
   */
  const changePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    playbackRateRef.current = rate;
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.playbackRate.value = rate;
      } catch (_) {}
    }
  }, []);

  /**
   * 音声ファイルをダウンロードする
   */
  const download = useCallback(async (path: string, id: string, fileName?: string) => {
    setIsDownloading(id);
    try {
      const { data } = supabase.storage.from('audio').getPublicUrl(path);
      const response = await fetch(data.publicUrl);
      if (!response.ok) throw new Error('Failed to fetch audio file');
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      
      let finalFileName = fileName || id;
      if (!finalFileName.toLowerCase().endsWith('.mp3')) {
        finalFileName += '.mp3';
      }
      link.download = finalFileName;
      document.body.appendChild(link);
      link.click();
      
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download processing failed:", error);
      throw error;
    } finally {
      setIsDownloading(null);
    }
  }, [supabase]);

  // コンポーネントのアンマウント時に再生を確実に止める
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        const nav = navigator as NavigatorWithAudioSession;
        if (nav.audioSession) {
          try { nav.audioSession.type = 'playback'; } catch (_) {}
        }
      }
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch (_) {}
        currentSourceRef.current = null;
      }
      // 🚀 iOS WebKit バグ対策：
      // 結果画面離脱時、裏で動いているマイク評価用オーディオセッションのスピーカー出力を受話器に破壊・固着させないため、
      // ここでの audioCtxRef.current.close() によるインスタンス強制破棄は明示的に行わず、ネイティブのガベージコレクションに安全に委ねる。
      currentPlayingIdRef.current = null;
    };
  }, []);

  return { 
    play, 
    stop,
    playChime,            // 【追加】
    unlockAudioContext,   // 【追加】
    preload,
    download, 
    isPlaying, 
    isDownloading,
    playbackRate,
    changePlaybackRate
  };
}