'use client';

import { useState, useCallback } from 'react';

export function useVoice() {
  const [isListening, setIsListening] = useState(false);

  // 読み上げ (Text-to-Speech)
  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = 'en-US';
    uttr.rate = 0.85;
    window.speechSynthesis.speak(uttr);
  }, []);

  // 録音・認識 (Speech-to-Text)
  const startListening = useCallback((onResult: (text: string) => void) => {
    if (typeof window === 'undefined') return;

    // 型定義により webkitSpeechRecognition も window から安全に取得可能
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('このブラウザは音声認識に対応していません。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    // 型安全に結果を取得
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    recognition.start();
  }, []);

  return { speak, startListening, isListening };
}