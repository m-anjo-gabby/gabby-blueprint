'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { unlockAudio } from '../audio/core/audioRuntime';
import { requestPlaybackSession, requestPlayAndRecordSession } from '../audio/core/audioSession';
import { getSpeechRecognizer, type RecognitionHandle } from '../audio/core/recognizer';
import { primeSpeechSynthesis } from '../speech/synthesis';

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

/** マイクテストで何も聞き取れなかった場合に失敗とするまでの時間 */
const MIC_TEST_TIMEOUT_MS = 8000;

// iOSのオーディオ出力をタップの同期区間で有効化する（共有の AudioContext をアンロックし、音声合成も起こしておく）
const warmupAudioSession = () => {
  void unlockAudio();
  primeSpeechSynthesis();
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
 * - マイクを使う前（テスト開始・getUserMedia の前）に録音再生モードへ切り替え、終了時に再生モードへ戻す
 *   （切り替えは audio/core/audioSession が一元管理する）
 * - マイクテストの認識は、発話評価と同じ認識方式（audio/core/recognizer）を使う
 */
export function useMicPermission(): UseMicPermissionReturn {
  const [micStatus, setMicStatus] = useState<MicStatus>('checking');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [testTranscript, setTestTranscript] = useState('');
  const [micTestSuccess, setMicTestSuccess] = useState(false);
  const [micTestError, setMicTestError] = useState(false);

  const recognitionRef = useRef<RecognitionHandle | null>(null);
  const testTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── マイクテスト停止 ────────────────────────────────────────────
  const stopMicTest = useCallback((success?: boolean, error?: boolean) => {
    if (testTimeoutRef.current) {
      clearTimeout(testTimeoutRef.current);
      testTimeoutRef.current = null;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsTestingMic(false);
    if (success !== undefined) setMicTestSuccess(success);
    if (error !== undefined) setMicTestError(error);

    // iOS WebKit: 終了時に playback（スピーカー出力）に戻す
    requestPlaybackSession();
  }, []);

  // ─── マイクテスト開始 ────────────────────────────────────────────
  const startMicTest = useCallback(() => {
    stopMicTest();

    // 🚀 マイク起動と同じタップイベント同期コンテキストでオーディオセッションを強制活性化
    warmupAudioSession();
    requestPlayAndRecordSession();

    const recognizer = getSpeechRecognizer();
    if (!recognizer.isSupported()) {
      setMicTestSuccess(false);
      setMicTestError(true);
      return;
    }

    setTestTranscript('');
    setMicTestSuccess(false);
    setMicTestError(false);
    setIsTestingMic(true);

    recognitionRef.current = recognizer.start({ lang: 'en-US' }, {
      // 認識開始 = マイクが許可されている
      onStart: () => setMicStatus('granted'),
      onTranscript: (text) => {
        setTestTranscript(text);
        // 何か発話が検知できたら即座に成功判定
        if (text.trim().length > 0) stopMicTest(true, false);
      },
      onError: (code) => {
        console.warn('Mic test error:', code);
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'start-failed') {
          setMicStatus('denied');
        }
        stopMicTest(false, true);
      },
    });

    testTimeoutRef.current = setTimeout(() => {
      stopMicTest(false, true);
    }, MIC_TEST_TIMEOUT_MS);
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
        } catch {
          // Safari 等で query が例外を吐いた場合はフォールバックへ
        }
      }

      // permissions.query が使えない（Safari 等）では
      // マウント時に getUserMedia を呼ぶとブラウザに拒否されるため 'prompt' に設定
      setMicStatus('prompt');
    } catch {
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
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      requestPlaybackSession();
    };
  }, []);

  // ─── getUserMedia による権限要求・先行確保（ウォームアップ） ───
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (typeof window === 'undefined') return false;

      // iOS WebKit: セッションが playback のままだと getUserMedia が許可ダイアログを出さずに拒否されるため、
      // getUserMedia より前に録音再生モードへ切り替える（同期処理のため、タップの同期区間は崩れない）
      requestPlayAndRecordSession();

      // 🚀 【最重要】iOS Safariの User Gesture Policy を完全にクリアするため、
      // ユーザータップ同期コールスタック内（あらゆる await の前）で getUserMedia を実行する。
      const streamPromise = navigator.mediaDevices.getUserMedia({ audio: true });

      // 🚀 マイク起動と同じタップイベント同期コンテキストでオーディオセッションを強制活性化
      warmupAudioSession();

      const stream = await streamPromise;
      stream.getTracks().forEach((track) => track.stop());
      setMicStatus('granted');
      // 🚀 本番への play-and-record 状態引き継ぎのため、ここでの playback への切り戻しは行わない
      return true;
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMicStatus('denied');
      } else {
        setMicStatus('prompt');
      }
      requestPlaybackSession();
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
