"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { analyzePhrase } from '@/utils/stringSimilarity';
import { AnalysisResult } from '@/types/wordDrill';

/**
 * ブラウザ標準の Web Speech API (Synthesis & Recognition) を利用した
 * 音声読み上げおよび簡易発音評価フック
 */
export function useWebSpeech() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  
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
   * @param targetPhrase お手本となる英文
   * @param mainWords 重要単語のリスト
   * @param onComplete 評価完了時に呼ばれるコールバック
   */
  const startAssessment = useCallback((
    targetPhrase: string, 
    mainWords: string[], 
    onComplete: (result: AnalysisResult) => void
  ) => {
    clearAllTimers();
    onCompleteRef.current = onComplete;
    // 初期化（何も聞こえていない状態）
    latestResultRef.current = analyzePhrase("", targetPhrase, mainWords);

    // 1. カウントダウン（制限時間）の設定
    setTimeLeft(7);
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    // 2. 音声認識とリアルタイム解析の開始
    startListening((heard) => {
      const result = analyzePhrase(heard, targetPhrase, mainWords);
      latestResultRef.current = result;

      // 【自動終了条件】スコアが極めて高い場合は即座に確定させる
      if (result.score >= 0.95) {
        finalize(result);
      }
    });

    // 3. タイムアップによる終了
    timerRef.current = setTimeout(() => {
      finalize();
    }, 7000);

  }, [startListening, clearAllTimers, finalize]);

  /**
   * ブラウザ標準機能によるテキスト読み上げ
   */
  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined') return;
    
    // 二重再生防止
    window.speechSynthesis.cancel();
    
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = 'en-US';
    
    uttr.onstart = () => setIsSpeaking(true);
    uttr.onend = () => setIsSpeaking(false);
    uttr.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(uttr);
  }, []);

  // コンポーネントのアンマウント時にタイマーを掃除
  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  return { 
    speak, 
    startAssessment, 
    stopListening, 
    timeLeft, 
    isListening, 
    isSpeaking 
  };
}