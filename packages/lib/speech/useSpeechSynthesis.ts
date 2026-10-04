'use client';

import { useCallback, useEffect, useState } from 'react';
import { cancelSpeech, getSpeechSynthesis } from './synthesis';

/**
 * ブラウザ標準の音声合成（speechSynthesis）による読み上げ。
 * 音声ファイルが未生成の教材などの代替読み上げに使う（発話の認識・評価は audio/react/useSpeakingPlayer）。
 */
export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);

  /** テキストを読み上げる（読み上げ中のものは止めてから読む）。非対応環境では何もしない */
  const speak = useCallback((text: string, rate = 1.0) => {
    const synth = getSpeechSynthesis();
    if (!synth) return;

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synth.speak(utterance);
  }, []);

  useEffect(() => () => cancelSpeech(), []);

  return { speak, isSpeaking };
}
