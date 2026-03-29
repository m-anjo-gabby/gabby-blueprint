'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@/lib/client';

/**
 * 音声再生およびダウンロードを管理するカスタムフック
 * Supabase Storageのパス解決からブラウザのダウンロード発火までを一括で扱う
 */
export function usePlayAudioSpeech() {
  // 現在再生中のアイテムID（phrase_idなど）
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  // 現在ダウンロード処理中のアイテムID
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const supabase = createClient();

  /**
   * 音声を再生する
   * @param path - Supabase Storage内の相対パス
   * @param id - アイテムを一意に識別するID
   */
  const play = useCallback(async (path: string, id: string) => {
    // 同じIDがクリックされた場合はトグル（停止）
    if (isPlaying === id) {
      audioRef.current?.pause();
      setIsPlaying(null);
      return;
    }

    // 他の再生中の音声を停止
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // 公開URLの取得
    const { data } = supabase.storage.from('audio').getPublicUrl(path);
    
    const audio = new Audio(data.publicUrl);
    audioRef.current = audio;
    
    // イベントハンドラの設定
    audio.onplay = () => setIsPlaying(id);
    audio.onended = () => setIsPlaying(null);
    audio.onerror = () => {
      console.error("Audio playback error");
      setIsPlaying(null);
    };

    try {
      await audio.play();
    } catch (error) {
      console.error("Playback failed:", error);
      setIsPlaying(null);
    }
  }, [isPlaying, supabase]);

  /**
   * 音声ファイルをダウンロードする
   * 公開URLからBlobを取得することで、ブラウザの別タブ移動を防ぎ「保存」を強制する
   * @param path - Supabase Storage内の相対パス
   * @param id - ローディング表示用の識別ID
   * @param fileName - 保存時のファイル名（拡張子抜き）
   */
  const download = useCallback(async (path: string, id: string, fileName?: string) => {
    setIsDownloading(id);
    try {
      // 1. 公開URLを取得
      const { data } = supabase.storage.from('audio').getPublicUrl(path);
      
      // 2. 実際のファイルデータをバイナリ(Blob)として取得
      const response = await fetch(data.publicUrl);
      if (!response.ok) throw new Error('Failed to fetch audio file');
      
      const blob = await response.blob();
      
      // 3. ブラウザメモリ上に一時的なURLを作成
      const blobUrl = window.URL.createObjectURL(blob);
      
      // 4. 隠しリンクを作成してクリックを発火
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${fileName || id}.mp3`; // ファイル名を指定
      document.body.appendChild(link);
      link.click();
      
      // 5. クリーンアップ
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download processing failed:", error);
      throw error; // エラーはコンポーネント側のToastで処理させる
    } finally {
      setIsDownloading(null);
    }
  }, [supabase]);

  // コンポーネントのアンマウント時に再生を確実に止める
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return { 
    play, 
    download, 
    isPlaying, 
    isDownloading 
  };
}