'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { cancelSpeech } from '@gabby/lib/speech/synthesis';

interface FavoriteAudio {
  /**
   * 音声を再生する（再生中の音声は止めてから再生し、常に1つだけ鳴らす）。
   * path が無い場合（音声ファイル未生成）はブラウザの音声合成で text を読み上げる
   */
  play: (id: string, text: string, path: string | null) => void;
  stop: () => void;
  /** 再生中の音声ID */
  activeId: string | null;
}

const FavoriteAudioContext = createContext<FavoriteAudio | null>(null);

/**
 * お気に入り一覧で共有する音声プレイヤー。
 * カードごとにプレイヤー（AudioContext）を作ると、件数に比例して AudioContext が増え
 * （iOSには同時に持てる数の上限がある）、複数のカードの音声が同時に鳴るため、一覧で1つだけ持つ。
 */
export function FavoriteAudioProvider({ children }: { children: ReactNode }) {
  const { play: playFile, stop: stopFile, isPlaying } = usePlayAudioSpeech();
  const { speak, isSpeaking } = useWebSpeech();
  const [speechId, setSpeechId] = useState<string | null>(null);

  const stop = useCallback(() => {
    cancelSpeech();
    stopFile();
  }, [stopFile]);

  const play = useCallback((id: string, text: string, path: string | null) => {
    stop();
    if (path) {
      setSpeechId(null);
      playFile(path, id, { restart: true });
    } else {
      setSpeechId(id);
      speak(text);
    }
  }, [playFile, speak, stop]);

  // 一覧を離れたら再生を止める
  useEffect(() => stop, [stop]);

  const activeId = isPlaying ?? (isSpeaking ? speechId : null);
  const value = useMemo(() => ({ play, stop, activeId }), [play, stop, activeId]);

  return <FavoriteAudioContext.Provider value={value}>{children}</FavoriteAudioContext.Provider>;
}

export function useFavoriteAudio(): FavoriteAudio {
  const audio = useContext(FavoriteAudioContext);
  if (!audio) throw new Error('useFavoriteAudio は FavoriteAudioProvider の内側で使ってください');
  return audio;
}
