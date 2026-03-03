"use client";

import { useState, useCallback, useRef } from 'react';
import { analyzePhrase, AnalysisResult } from '@/utils/stringSimilarity';

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [feedback, setFeedback] = useState<AnalysisResult | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // フィードバックリセット
  const resetFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  // --- 1. 既存の単語帳で使っている関数（互換用）---
  const startListening = useCallback((onResult: (text: string) => void) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        finalTranscript += event.results[i][0].transcript;
      }
      onResult(finalTranscript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current); // カウントダウン停止
    recognitionRef.current?.stop();
    setIsListening(false);
    setTimeLeft(0); // リセット
  }, []);

  // --- 2. 新しい評価用関数 ---
  const startEvaluation = useCallback((
    targetPhrase: string, 
    mainWords: string[], 
    onResult: (result: AnalysisResult) => void
  ) => {

    // すでにタイマーがあればクリア
    if (timerRef.current) clearTimeout(timerRef.current);

    // 初期値セット
    setTimeLeft(7);
    // 1秒ごとのカウントダウン
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    // 既存の startListening を評価ロジック付きで実行
    startListening((heard) => {
      const result = analyzePhrase(heard, targetPhrase, mainWords);
      setFeedback(result);
      onResult(result);
    });

    // 7秒後に自動停止
    timerRef.current = setTimeout(() => {
      stopListening();
    }, 7000);

  }, [startListening, stopListening]);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = 'en-US';
    uttr.onstart = () => setIsSpeaking(true);
    uttr.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(uttr);
  }, []);

  return { 
    speak, 
    startListening,
    startEvaluation, 
    stopListening, 
    resetFeedback,
    timeLeft,
    isListening, 
    isSpeaking, 
    feedback 
  };
}