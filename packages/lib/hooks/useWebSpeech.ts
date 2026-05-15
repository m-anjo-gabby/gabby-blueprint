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

  // 【追加】現在の評価セッションが有効かどうかを管理
  // ブラウザ側のイベント発火タイミングの差（Edge/Safari等）による不整合を防ぐガードレール
  const isAssessingRef = useRef(false);

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
    // 既に評価が終了している場合は二重実行を防止
    if (!isAssessingRef.current) return;
    isAssessingRef.current = false;

    const finalResult = result || latestResultRef.current;
    
    // 【重要】Reactのレンダリング中（setTimeLeft内）に store 更新が走るのを防ぐため、
    // コールバックをイベントループの次に回す。これにより Chrome の警告を解消。
    if (finalResult && onCompleteRef.current) {
      const callback = onCompleteRef.current;
      setTimeout(() => {
        callback(finalResult);
      }, 0);
    }
    
    // 音声認識の停止
    if (recognitionRef.current) {
      try {
        // abort() を使用することで、Edge等での不要な後追いイベントを遮断
        recognitionRef.current.abort();
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

    // 既存のインスタンスがあれば確実に破棄
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => setIsListening(true);
    
    // Edge等で勝手に認識が終了した場合のハンドリング
    recognition.onend = () => {
      if (isAssessingRef.current) {
        setIsListening(false);
      }
    };

    // エラーハンドリング（Edge等でマイクが不安定な場合の安全策）
    recognition.onerror = (event: any) => {
      console.warn("Speech Recognition Error:", event.error);
      if (event.error !== 'no-speech' && isAssessingRef.current) {
        finalize();
      }
    };

    recognition.onresult = (event: any) => {
      // 評価セッションが終了している場合は結果を無視
      if (!isAssessingRef.current) return;

      let currentText = '';
      for (let i = 0; i < event.results.length; i++) {
        currentText += event.results[i][0].transcript;
      }
      onUpdate(currentText);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [finalize]);

  /**
   * 発音評価を開始するメインメソッド
   */
  const startAssessment = useCallback((
    targetPhrase: string, 
    mainWords: string[], 
    onComplete: (result: AnalysisResult) => void
  ) => {
    // 前回のセッションが残っていれば強制終了
    if (isAssessingRef.current) {
      finalize();
    }

    // セッション開始
    isAssessingRef.current = true;
    clearAllTimers();
    onCompleteRef.current = onComplete;
    latestResultRef.current = analyzePhrase("", targetPhrase, mainWords);

    setTimeLeft(7);
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Edge/Safari 対策: 0秒になった後、ブラウザが最後の音声バッファを
          // テキスト化して onresult を叩くまでの猶予（500ms）を置いてから確定する
          setTimeout(() => {
            if (isAssessingRef.current) finalize();
          }, 500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    startListening((heard) => {
      const result = analyzePhrase(heard, targetPhrase, mainWords);
      latestResultRef.current = result;

      // エクセレント達成時は即座に確定
      if (result.score >= 0.95) {
        finalize(result);
      }
    });

    // セーフティタイマー（猶予分を考慮して調整）
    timerRef.current = setTimeout(() => {
      if (isAssessingRef.current) {
        finalize();
      }
    }, 8500);

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

  // コンポーネントのアンマウント時に徹底的に掃除
  useEffect(() => {
    return () => {
      isAssessingRef.current = false;
      clearAllTimers();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    };
  }, [clearAllTimers]);

  return { 
    speak, 
    setSpeechRate, 
    startAssessment, 
    stopListening, 
    timeLeft, 
    isListening, 
    isSpeaking 
  };
}