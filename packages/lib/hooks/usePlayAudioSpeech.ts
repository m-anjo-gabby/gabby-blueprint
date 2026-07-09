// packages\lib\hooks\usePlayAudioSpeech.ts
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createBrowserClient } from '../supabase/client';
import { audioBufferCache } from '../sprint/utils';

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
  // 現在再生中のアイテムID（phrase_idなど）
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
  // グローバルキャッシュを使用（画面を行き来してもバッファが維持される）
  
  const supabase = createBrowserClient();

  /**
   * iOS対策: 放置されてフリーズしたAudioContextを安全に取得・復旧・再生成する内部関数
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

    // iOS Safari特有の、放置によるサスペンド状態をタップのコールスタック内で復旧
    if (ctx && ctx.state === 'suspended') {
      try {
        // 🆕 iOS対策：resume() 自体がフリーズして戻ってこないバグを回避するためタイムアウトを導入
        const resumeWithTimeout = Promise.race([
          ctx.resume(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("AudioContext resume timeout")), 500))
        ]);

        await resumeWithTimeout;

        // resume()してもロックが解除されないバグ状態を検知した場合、インスタンスを強制再生成
        if (ctx.state === 'suspended') {
          console.warn("AudioContext stuck in suspended state on iOS. Re-creating instance...");
          ctx.close().catch(() => {});
          audioCtxRef.current = new AudioContextClass() as AudioContext;
          ctx = audioCtxRef.current;
          await ctx.resume();
        }
      } catch (e) {
        console.warn("Failed or timed out resuming AudioContext. Force recreating...", e);
        // 🆕 タイムアウト、またはエラー時は古いコンテキストを破棄して完全に新規作り直す
        try { ctx.close().catch(() => {}); } catch (_) {}
        audioCtxRef.current = new AudioContextClass() as AudioContext;
        ctx = audioCtxRef.current;
        // 新規作成直後のコールスタック内で再度同期的にアクティベート
        try { await ctx.resume(); } catch (_) {}
      }
    }

    return audioCtxRef.current;
  }, []);

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
   * 音声を再生する
   * @param path - Supabase Storage内の相対パス
   * @param id - アイテムを一意に識別するID
   * @param options - 再生オプション (restart: true の場合、同じIDでも最初から再生)
   */
  const play = useCallback(async (path: string, id: string, options?: { restart?: boolean }): Promise<void> => {
    // 1. 強固になった初期化ロジックを実行
    const ctx = await getOrInitializeAudioContext();
    if (!ctx) return;

    // 2. 同じIDがクリックされた場合
    if (currentPlayingIdRef.current === id) {
      if (!options?.restart) {
        // トグル停止
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

    // パスがない場合は安全に終了させる
    if (!path) {
      setIsPlaying(null);
      currentPlayingIdRef.current = null;
      return;
    }

    // 公開URLの取得
    const { data } = supabase.storage.from('audio').getPublicUrl(path);
    const bucketUrl = data.publicUrl;

    // シーケンス再生を同期制御できるよう、Promiseを返却する形にシームレス拡張
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
            resolve(); // 再生完了時にPromiseを解決
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

      // キャッシュ確認
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
            // 🆕 WebKitバグ対策：古いコンテキストのフリーズによるdecodeデッドロックを回避するためタイムアウト付きでデコード
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
            resolve(); // 🆕 フリーズしても呼び出し元のループがスタックしないよう、必ずresolveする
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
    // 再生中の音声があれば即座に反映
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.playbackRate.value = rate;
      } catch (_) {}
    }
  }, []);

  /**
   * 音声ファイルをダウンロードする
   * 公開URLからBlobを取得することで、ブラウザの別タブ移動を防ぎ「保存」を強制する
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
      
      // 拡張子の二重付与を防止
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
      // 🚀 アンマウント時にも確実にスピーカー出力へ戻す
      if (typeof window !== 'undefined') {
        const nav = navigator as NavigatorWithAudioSession;
        if (nav.audioSession) {
          try { nav.audioSession.type = 'playback'; } catch (_) { /* no-op */ }
        }
      }
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch (_) {}
        currentSourceRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      currentPlayingIdRef.current = null;
    };
  }, []);

  return { 
    play, 
    stop,
    preload,
    download, 
    isPlaying, 
    isDownloading,
    playbackRate,
    changePlaybackRate
  };
}