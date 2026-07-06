'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { setAudioSessionPlayback, setAudioSessionPlayAndRecord } from '../sprint/utils';

export type MicStatus = 'checking' | 'granted' | 'denied' | 'prompt';

export interface UseMicPermissionReturn {
  micStatus: MicStatus;
  isTestingMic: boolean;
  testTranscript: string;
  micTestSuccess: boolean;
  micTestError: boolean;
  startMicTest: () => void;
  stopMicTest: (success?: boolean, error?: boolean) => void;
  requestMicPermission: () => Promise<boolean>;
}

// 無音のダミー音声再生により、iOSのオーディオセッションを強制活性化（アクティベート）させるヘルパー
const warmupAudioSession = () => {
  if (typeof window === 'undefined') return;
  try {
    const audio = new Audio();
    // 1ドットの無音 wav データ
    audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
    audio.play().catch(() => {});
    if (window.speechSynthesis) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
  } catch (e) {
    console.warn('Audio session warmup failed:', e);
  }
};

/**
 * マイク権限の確認・テスト機能を提供するフック。
 *
 * ## 使用箇所
 * - SprintSelect: マイクチェックアコーディオン全体
 * - SprintTimePlayer: micStatus の監視のみ（テスト機能は使用しない）
 *
 * ## iOS Safari 対応
 * - `navigator.permissions.query` が例外を吐くブラウザでは 'prompt' にフォールバック
 * - マイクテスト開始時に `setAudioSessionPlayAndRecord()` へ切り替え
 * - 終了時に `setAudioSessionPlayback()` へ復元して受話器モードを防止
 */
export function useMicPermission(): UseMicPermissionReturn {
  const [micStatus, setMicStatus] = useState<MicStatus>('checking');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [testTranscript, setTestTranscript] = useState('');
  const [micTestSuccess, setMicTestSuccess] = useState(false);
  const [micTestError, setMicTestError] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const testTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ─── マイクテスト停止 ────────────────────────────────────────────
  const stopMicTest = useCallback((success?: boolean, error?: boolean) => {
    if (testTimeoutRef.current) {
      clearTimeout(testTimeoutRef.current);
      testTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (_) {
        // すでに停止している場合のエラー回避
      }
      recognitionRef.current = null;
    }
    setIsTestingMic(false);
    if (success !== undefined) setMicTestSuccess(success);
    if (error !== undefined) setMicTestError(error);

    // iOS WebKit: 終了時に playback（スピーカー出力）に戻す
    setAudioSessionPlayback();
  }, []);

  // ─── マイクテスト開始 ────────────────────────────────────────────
  const startMicTest = useCallback(() => {
    stopMicTest();

    // 🚀 マイク起動と同じタップイベント同期コンテキストでオーディオセッションを強制活性化
    warmupAudioSession();

    // iOS WebKit: 録音再生モードに切り替え（レシーバーモード防止）
    setAudioSessionPlayAndRecord();

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setMicTestSuccess(false);
      setMicTestError(true);
      return;
    }

    setTestTranscript('');
    setMicTestSuccess(false);
    setMicTestError(false);
    setIsTestingMic(true);

    const recognition = new SpeechRecognitionClass() as SpeechRecognition;
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
      // 認識開始 = マイクが許可されている
      setMicStatus('granted');
    };

    recognition.onresult = (event: any) => {
      let currentText = '';
      for (let i = 0; i < event.results.length; i++) {
        currentText += event.results[i][0].transcript;
      }
      setTestTranscript(currentText);

      // 何か発話が検知できたら即座に成功判定
      if (currentText.trim().length > 0) {
        stopMicTest(true, false);
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Mic test error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMicStatus('denied');
        stopMicTest(false, true);
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        stopMicTest(false, true);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('Mic recognition start failed:', e);
      setMicStatus('denied');
      stopMicTest(false, true);
      return;
    }

    // 8秒のタイムアウト
    testTimeoutRef.current = setTimeout(() => {
      stopMicTest(false, true);
    }, 8000);
  }, [stopMicTest]);

  // ─── 権限チェック ────────────────────────────────────────────────
  const checkMicPermission = useCallback(async () => {
    try {
      if (typeof window === 'undefined') return;

      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permissionStatus = await navigator.permissions.query({
            name: 'microphone' as PermissionName,
          });
          setMicStatus(permissionStatus.state as MicStatus);
          permissionStatus.onchange = () => {
            setMicStatus(permissionStatus.state as MicStatus);
          };
          return;
        } catch (_) {
          // Safari 等で query が例外を吐いた場合はフォールバックへ
        }
      }

      // permissions.query が使えない（Safari 等）では
      // マウント時に getUserMedia を呼ぶとブラウザに拒否されるため 'prompt' に設定
      setMicStatus('prompt');
    } catch (_) {
      setMicStatus('prompt');
    }
  }, []);

  // マウント時に権限チェック（マイクロタスクで遅延してレンダリングと分離）
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) checkMicPermission();
    });
    return () => {
      active = false;
    };
  }, [checkMicPermission]);

  // アンマウント時にリソースを確実に解放
  useEffect(() => {
    return () => {
      if (testTimeoutRef.current) clearTimeout(testTimeoutRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
        recognitionRef.current = null;
      }
      setAudioSessionPlayback();
    };
  }, []);

  // ─── getUserMedia による権限要求・先行確保（ウォームアップ） ───
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (typeof window === 'undefined') return false;
      
      // 🚀 マイク起動と同じタップイベント同期コンテキストでオーディオセッションを強制活性化
      warmupAudioSession();
      
      // iOS WebKit: 録音再生モードに切り替え
      setAudioSessionPlayAndRecord();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicStatus('granted');
      
      // 終了後に一度 playback（スピーカー出力）に戻す
      setAudioSessionPlayback();
      return true;
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMicStatus('denied');
      } else {
        setMicStatus('prompt');
      }
      setAudioSessionPlayback();
      return false;
    }
  }, []);

  return {
    micStatus,
    isTestingMic,
    testTranscript,
    micTestSuccess,
    micTestError,
    startMicTest,
    stopMicTest,
    requestMicPermission,
  };
}
