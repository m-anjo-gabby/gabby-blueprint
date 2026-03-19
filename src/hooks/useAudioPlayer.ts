// src/hooks/useAudioPlayer.ts
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@/lib/client';

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState<string | null>(null); // 再生中のIDを保持
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const supabase = createClient();

  const play = useCallback(async (path: string, id: string) => {
    // 既に同じ音声が再生中なら止める
    if (isPlaying === id) {
      audioRef.current?.pause();
      setIsPlaying(null);
      return;
    }

    // 以前の音声を停止
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // Supabaseから公開URLを取得
    const { data } = supabase.storage.from('audio').getPublicUrl(path);
    
    const audio = new Audio(data.publicUrl);
    audioRef.current = audio;
    
    audio.onplay = () => setIsPlaying(id);
    audio.onended = () => setIsPlaying(null);
    audio.onerror = () => setIsPlaying(null);

    try {
      await audio.play();
    } catch (error) {
      console.error("Playback failed:", error);
      setIsPlaying(null);
    }
  }, [isPlaying, supabase]);

  // アンマウント時に音声を止める
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  return { play, isPlaying };
}