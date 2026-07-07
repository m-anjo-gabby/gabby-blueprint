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
   * 音声を再生する
   * @param path - Supabase Storage内の相対パス
   * @param id - アイテムを一意に識別するID
   * @param options - 再生オプション (restart: true の場合、同じIDでも最初から再生)
   */
  const play = useCallback(async (path: string, id: string, options?: { restart?: boolean }) => {
    // 1. AudioContext の初期化
    if (!audioCtxRef.current) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass() as AudioContext;
      }
    }

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // 2. iOSの自動再生制限ロックを解除するために同期的に resume する
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn("Failed to resume AudioContext in usePlayAudioSpeech:", e);
      }
    }

    // 3. 同じIDがクリックされた場合
    if (currentPlayingIdRef.current === id) {
      if (!options?.restart) {
        // トグル停止
        if (currentSourceRef.current) {
          try {
            currentSourceRef.current.stop();
          } catch (_) {}
          currentSourceRef.current = null;
        }
        setIsPlaying(null);
        currentPlayingIdRef.current = null;
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

    // 公開URLの取得
    const { data } = supabase.storage.from('audio').getPublicUrl(path);
    const bucketUrl = data.publicUrl;

    const startPlayback = (buffer: AudioBuffer) => {
      const run = () => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRateRef.current;

        const gainNode = ctx.createGain();
        gainNode.gain.value = 1.0;

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

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
        };

        source.onended = clearState;
        source.start(0);
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(run).catch(() => {
          setIsPlaying(null);
          currentPlayingIdRef.current = null;
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
      try {
        const res = await fetch(bucketUrl);
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
        audioBufferCache.set(bucketUrl, decodedBuffer);
        startPlayback(decodedBuffer);
      } catch (err) {
        console.error("Audio Context decode error:", err);
        setIsPlaying(null);
        currentPlayingIdRef.current = null;
      }
    }
  }, [supabase]);

  /**
   * 音声をプリロード（先読み）する
   * @param path - Supabase Storage内の相対パス
   */
  const preload = useCallback(async (path: string) => {
    if (!path) return;
    if (!audioCtxRef.current) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass() as AudioContext;
      }
    }
    const ctx = audioCtxRef.current;
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
  }, [supabase]);

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
    preload,
    download, 
    isPlaying, 
    isDownloading,
    playbackRate,
    changePlaybackRate
  };
}