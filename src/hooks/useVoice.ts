'use client';

import { useState, useCallback, useRef } from 'react';

/**
 * Web Speech API の型定義。
 * ブラウザ標準の型定義が不足しているため、必要なプロパティをインターフェースで補完します。
 */
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onstart: () => void;
  onend: () => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onresult: (event: SpeechRecognitionEvent) => void;
}

/**
 * Windowインターフェースの拡張。
 * iOS Safari 等で使用される webkit プリフィックス付きの API を許容します。
 */
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

/**
 * 音声読み上げ(TTS)および音声認識(STT)を管理するカスタムフック。
 */
export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  
  // 認識インスタンスとタイマーをRefで保持（再レンダリングを避け、外部から制御可能にする）
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 音声読み上げ (Text-to-Speech)
   */
  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = 'en-US';
    uttr.rate = 0.85;
    window.speechSynthesis.speak(uttr);
  }, []);

  /**
   * 音声認識の強制停止処理
   * 最終的なテキストを受け取り、コールバックを呼んでから終了します。
   */
  const stopListening = useCallback((finalText?: string, onResult?: (text: string) => void) => {
    if (finalText !== undefined && onResult) {
      onResult(finalText); // 停止ボタンが押された瞬間のテキストを確定させる
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsListening(false);
  }, []);

  /**
   * 音声認識の開始 (Speech-to-Text)
   */
  const startListening = useCallback((onResult: (text: string) => void) => {
    if (typeof window === 'undefined') return;

    // 最新の認識中テキストを保持するローカル変数
    let currentTranscript = '';

    if (isListening) {
      // ボタン再タップ時：現在のテキストを渡して停止
      stopListening(currentTranscript, onResult);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('音声認識に対応していないブラウザです。iOS Safari等でご利用ください。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    
    recognition.lang = 'en-US';
    // interimResults: true にすることで、話し中もリアルタイムに結果を取得
    recognition.interimResults = true;
    // continuous: true にすることで、発話が途切れても自動終了しないように設定
    recognition.continuous = true; 

    recognition.onstart = () => {
      setIsListening(true);
      timeoutRef.current = setTimeout(() => {
        stopListening(currentTranscript, onResult);
      }, 10000);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };

    /**
     * 結果取得時の処理
     * continuousモードでは結果が配列形式で増えていくため、最新の全文章を結合して返します。
     */
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        finalTranscript += event.results[i][0].transcript;
      }
      currentTranscript = finalTranscript; // 内部変数を更新
      onResult(finalTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech Recognition Error:', event.error);
      stopListening();
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('Speech Recognition start fail:', e);
      setIsListening(false);
    }
  }, [isListening, stopListening]);

  return { speak, startListening, stopListening, isListening };
}