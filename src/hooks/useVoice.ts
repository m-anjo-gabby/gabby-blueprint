"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { analyzePhrase } from '@/utils/stringSimilarity';
import { AnalysisResult } from '@/types/wordDrill';

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // 手動停止時やタイムアップ時に「その時の最新結果」を出すための保持用
  const latestResultRef = useRef<AnalysisResult | null>(null);
  const onCompleteRef = useRef<((result: AnalysisResult) => void) | null>(null);

  const clearAllTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timerRef.current = null;
    intervalRef.current = null;
  }, []);

  // 評価を確定させて終了する内部関数
  const finalize = useCallback((result?: AnalysisResult) => {
    const finalResult = result || latestResultRef.current;
    if (finalResult && onCompleteRef.current) {
      onCompleteRef.current(finalResult);
    }
    
    // 停止処理
    if (recognitionRef.current) recognitionRef.current.stop();
    clearAllTimers();
    setIsListening(false);
    setTimeLeft(0);
    onCompleteRef.current = null;
  }, [clearAllTimers]);

  // 手動停止用
  const stopListening = useCallback(() => {
    finalize();
  }, [finalize]);

  const startListening = useCallback((onUpdate: (heard: string) => void) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true; // 途切れても停止させない

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      let currentText = '';
      for (let i = 0; i < event.results.length; i++) {
        currentText += event.results[i][0].transcript;
      }
      onUpdate(currentText);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const startEvaluation = useCallback((
    targetPhrase: string, 
    mainWords: string[], 
    onComplete: (result: AnalysisResult) => void
  ) => {
    clearAllTimers();
    onCompleteRef.current = onComplete;
    latestResultRef.current = analyzePhrase("", targetPhrase, mainWords); // 初期化

    // 1. カウントダウン開始
    setTimeLeft(7);
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    // 2. 音声認識開始
    startListening((heard) => {
      const result = analyzePhrase(heard, targetPhrase, mainWords);
      latestResultRef.current = result;

      // 【終了条件1】高評価 (0.95以上) で自動終了
      if (result.score >= 0.95) {
        finalize(result);
      }
    });

    // 3. 【終了条件2】制限時間超過 (7秒)
    timerRef.current = setTimeout(() => {
      finalize();
    }, 7000);

  }, [startListening, clearAllTimers, finalize]);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = 'en-US';
    uttr.onstart = () => setIsSpeaking(true);
    uttr.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(uttr);
  }, []);

  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  return { speak, startEvaluation, stopListening, timeLeft, isListening, isSpeaking };
}