'use client';

import { useState, useCallback, useRef } from 'react';
import { createBrowserClient } from '../supabase/client';
import { useAudioEngine } from './useAudioEngine';

/**
 * 音声再生およびダウンロードを管理するカスタムフック。
 * 内部的には `useAudioEngine` の薄いラッパーであり、以下の挙動を維持している:
 * - 再生は即時開始（iOS向けディレイなし）
 * - unmount時にAudioContextをcloseしない（iOS WebKitのレシーバー固着バグ対策）
 * - suspended状態からは500msタイムアウト付きで強制再生成リカバリを行う
 * - decodeAudioDataに1秒のタイムアウトを設ける
 * - チャイム再生前に既存トラックを停止する
 * - URL解決には supabase.storage.getPublicUrl を使用する
 */
export function usePlayAudioSpeech() {
  const engine = useAudioEngine({
    startDelayMs: 0,
    closeOnUnmount: false,
    useSuspendedRecovery: true,
    decodeTimeoutMs: 1000,
    stopBeforeChime: true,
    urlResolution: 'sdk',
  });

  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const playbackRateRef = useRef<number>(1.0);
  const supabaseRef = useRef(createBrowserClient());

  const play = useCallback((
    path: string | null,
    id: string,
    options?: { restart?: boolean; bucketName?: string; onError?: (error: unknown) => void },
  ): Promise<void> => {
    return engine.play(path, {
      id,
      restart: options?.restart,
      bucketName: options?.bucketName,
      playbackRate: playbackRateRef.current,
      onError: options?.onError,
    });
  }, [engine]);

  const changePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    playbackRateRef.current = rate;
    engine.setLiveRate(rate);
  }, [engine]);

  /**
   * 音声ファイルをダウンロードする
   */
  const download = useCallback(async (path: string, id: string, fileName?: string, options?: { bucketName?: string }) => {
    setIsDownloading(id);
    try {
      let bucketUrl = path;
      if (!path.startsWith('http://') && !path.startsWith('https://')) {
        const bucketName = options?.bucketName || 'audio';
        const { data } = supabaseRef.current.storage.from(bucketName).getPublicUrl(path);
        bucketUrl = data.publicUrl;
      }
      const response = await fetch(bucketUrl);
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
      console.error('Download processing failed:', error);
      throw error;
    } finally {
      setIsDownloading(null);
    }
  }, []);

  return {
    play,
    stop: engine.stop,
    playChime: engine.playChime,
    unlockAudioContext: engine.unlock,
    preload: engine.preload,
    download,
    isPlaying: engine.isPlaying,
    isDownloading,
    playbackRate,
    changePlaybackRate,
    resumeStatus: engine.resumeStatus,
  };
}
