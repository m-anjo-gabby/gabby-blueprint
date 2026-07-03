'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createBrowserClient } from '../supabase/client';

interface NavigatorWithAudioSession extends Navigator {
  audioSession?: {
    type: 'playback' | 'play-and-record';
  };
}

/**
 * 音声再生およびダウンロードを管理するカスタムフック
 * Supabase Storageのパス解決からブラウザのダウンロード発火までを一括で扱う
 */
export function usePlayAudioSpeech() {
  // 現在再生中のアイテムID（phrase_idなど）
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  // 現在ダウンロード処理中のアイテムID
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  // 再生速度の状態（UI表示用：デフォルトは 1.0）
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  
  // 再生制御用の最新値を保持（依存関係のループ防止および再生中の動的変更用）
  const currentPlayingIdRef = useRef<string | null>(null);
  const playbackRateRef = useRef<number>(1.0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const supabase = createBrowserClient();

  /**
   * 音声を再生する
   * @param path - Supabase Storage内の相対パス
   * @param id - アイテムを一意に識別するID
   * @param options - 再生オプション (restart: true の場合、同じIDでも最初から再生)
   */
  const play = useCallback(async (path: string, id: string, options?: { restart?: boolean }) => {
    // 🚀 iOSでの受話レシーバー極小音量問題を回避するため、再生開始時に強制的にスピーカー出力(playback)へ設定
    if (typeof window !== 'undefined') {
      const nav = navigator as NavigatorWithAudioSession;
      if (nav.audioSession) {
        try { nav.audioSession.type = 'playback'; } catch (_) { /* no-op */ }
      }
    }

    // 同じIDがクリックされた場合
    if (currentPlayingIdRef.current === id) {
      if (options?.restart) {
        // ドリル用：最初からリスタート
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
          return;
        }
      } else {
        // アドミン用：トグル（停止）
        audioRef.current?.pause();
        return;
      }
    }

    // 他の再生中の音声を停止
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // 公開URLの取得
    const { data } = supabase.storage.from('audio').getPublicUrl(path);
    
    const audio = new Audio(data.publicUrl);
    
    // 現在の再生速度を適用（Refから取得することで依存配列への追加を回避）
    audio.playbackRate = playbackRateRef.current;
    
    audioRef.current = audio;
    currentPlayingIdRef.current = id;
    
    // イベントハンドラの設定
    audio.onplay = () => setIsPlaying(id);
    
    // 停止・終了・エラー時に状態をクリアする共通処理
    const clearState = () => {
      if (currentPlayingIdRef.current === id) {
        setIsPlaying(null);
        currentPlayingIdRef.current = null;
      }
    };

    audio.onended = clearState;
    audio.onpause = clearState;
    audio.onerror = () => {
      console.error("Audio playback error");
      clearState();
    };

    try {
      await audio.play();
    } catch (error) {
      console.error("Playback failed:", error);
      clearState();
    }
  }, [supabase]); // playbackRate や isPlaying に依存しないため参照が安定する

  /**
   * 音声をプリロード（先読み）する
   * @param path - Supabase Storage内の相対パス
   */
  const preload = useCallback((path: string) => {
    if (!path) return;
    const { data } = supabase.storage.from('audio').getPublicUrl(path);
    
    const audio = new Audio(data.publicUrl);
    audio.preload = 'auto';
    
    // 読み込み完了またはエラー時に参照を外してメモリを解放
    const cleanUp = () => {
      audio.removeEventListener('canplaythrough', cleanUp);
      audio.removeEventListener('error', cleanUp);
    };
    audio.addEventListener('canplaythrough', cleanUp);
    audio.addEventListener('error', cleanUp);
    
    audio.load(); 
  }, [supabase]);

  /**
   * 再生速度を変更する
   * @param rate - 再生速度 (0.5 ~ 2.0)
   */
  const changePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    playbackRateRef.current = rate;
    // 再生中の音声があれば即座に反映
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        currentPlayingIdRef.current = null;
      }
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