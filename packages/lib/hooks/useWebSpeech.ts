"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { analyzePhrase } from '../assessment/native-speech';
import { AnalysisResult } from '../../types/wordDrill';

/**
 * ブラウザ標準の Web Speech API (Synthesis & Recognition) を利用した
 * 音声読み上げおよび簡易発音評価フック
 */
export function useWebSpeech() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  
  // 再生速度の保持用（デフォルト 1.0）
  const speechRateRef = useRef<number>(1.0);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // 評価結果の一時保持およびコールバック用
  const latestResultRef = useRef<AnalysisResult | null>(null);
  const onCompleteRef = useRef<((result: AnalysisResult) => void) | null>(null);

  const clearAllTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timerRef.current = null;
    intervalRef.current = null;
  }, []);

  /**
   * 評価を確定させてリソースを解放する内部関数
   */
  const finalize = useCallback((result?: AnalysisResult) => {
    const finalResult = result || latestResultRef.current;
    
    // 完了コールバックの実行
    if (finalResult && onCompleteRef.current) {
      onCompleteRef.current(finalResult);
    }
    
    // 音声認識の停止
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // すでに停止している場合の型エラー回避
      }
    }

    clearAllTimers();
    setIsListening(false);
    setTimeLeft(0);
    onCompleteRef.current = null;
  }, [clearAllTimers]);

  /**
   * 外部から評価を強制終了するためのメソッド
   */
  const stopListening = useCallback(() => {
    finalize();
  }, [finalize]);

  /**
   * 音声認識の生データを取得するための内部関数
   */
  const startListening = useCallback((onUpdate: (heard: string) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("Web Speech API is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

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

  /**
   * 発音評価を開始するメインメソッド
   */
  const startAssessment = useCallback((
    targetPhrase: string, 
    mainWords: string[], 
    onComplete: (result: AnalysisResult) => void
  ) => {
    clearAllTimers();
    onCompleteRef.current = onComplete;
    latestResultRef.current = analyzePhrase("", targetPhrase, mainWords);

    setTimeLeft(7);
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    startListening((heard) => {
      const result = analyzePhrase(heard, targetPhrase, mainWords);
      latestResultRef.current = result;

      if (result.score >= 0.95) {
        finalize(result);
      }
    });

    timerRef.current = setTimeout(() => {
      finalize();
    }, 7000);

  }, [startListening, clearAllTimers, finalize]);

  /**
   * ブラウザ標準機能によるテキスト読み上げ
   * @param text 読み上げるテキスト
   * @param rate 再生速度 (オプション)
   */
  const speak = useCallback((text: string, rate?: number) => {
    if (typeof window === 'undefined') return;
    
    // 二重再生防止
    window.speechSynthesis.cancel();
    
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = 'en-US';
    
    // 速度の設定：引数のrateがあれば優先、なければRefの現在値を採用
    const targetRate = rate ?? speechRateRef.current;
    uttr.rate = targetRate;
    
    uttr.onstart = () => setIsSpeaking(true);
    uttr.onend = () => setIsSpeaking(false);
    uttr.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(uttr);
  }, []);

  /**
   * 外部から再生速度を同期させるためのメソッド
   */
  const setSpeechRate = useCallback((rate: number) => {
    speechRateRef.current = rate;
  }, []);

  // コンポーネントのアンマウント時にタイマーを掃除
  useEffect(() => {
    return () => {
      clearAllTimers();
      if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    };
  }, [clearAllTimers]);

  return { 
    speak, 
    setSpeechRate, // 速度設定用に追加
    startAssessment, 
    stopListening, 
    timeLeft, 
    isListening, 
    isSpeaking 
  };
}