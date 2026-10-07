import type { RecognitionCallbacks, RecognitionHandle, RecognitionStartOptions, SpeechRecognizerEngine } from './types';
import { clientLogger } from '../../../logger/client';

type SpeechRecognitionConstructor = new () => SpeechRecognition;

/** lib.dom に型が無い環境向けの最小限の定義 */
interface RecognitionErrorEventLike extends Event {
  error: string;
}

function getSpeechRecognitionClass(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const isMobileDevice = () =>
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

/**
 * ブラウザ標準の Web Speech API（SpeechRecognition）による認識。
 * - モバイルは単発認識（continuous=false）、PCは連続認識
 * - 認識中に途切れた場合（onend）は、止められるまで自動で再開する
 * - 'no-speech'（モバイルで頻発する無音タイムアウト）は失敗扱いにせず、自動再開に任せる
 * - 呼ぶたびに新しいインスタンスを作り、止めたものは使い回さない
 */
export const webSpeechRecognizer: SpeechRecognizerEngine = {
  name: 'web-speech',

  isSupported: () => getSpeechRecognitionClass() !== null,

  start(options: RecognitionStartOptions, callbacks: RecognitionCallbacks): RecognitionHandle {
    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) {
      clientLogger.warn('speech:not_supported', 'Web Speech API is not supported in this browser');
      queueMicrotask(() => callbacks.onError?.('not-supported'));
      return { stop: () => { /* no-op */ } };
    }

    let active = true;
    const recognition = new SpeechRecognitionClass();
    recognition.lang = options.lang;
    recognition.interimResults = true;
    recognition.continuous = !isMobileDevice();

    recognition.onstart = () => {
      if (active) callbacks.onStart?.();
    };

    recognition.onend = () => {
      if (!active) return;
      // 🚀 止められていなければ自動的に再開して認識を継続する（Edge/Safari等で途中終了するため）
      try {
        recognition.start();
      } catch (e) {
        clientLogger.debug('speech:auto_restart_failed', 'Speech recognition auto-restart failed', { err: e });
      }
    };

    recognition.onerror = (event: Event) => {
      const { error } = event as RecognitionErrorEventLike;
      if (!active) return;
      clientLogger.debug('speech:recognition_failed', 'Speech recognition error', { payload: { error } });
      if (error === 'no-speech' || error === 'aborted') return;
      active = false;
      try { recognition.abort(); } catch { /* no-op */ }
      callbacks.onError?.(error);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!active) return;
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      // 末尾セグメントが未確定（isFinal=false）の場合、ブラウザの言語モデルによる「それらしい続き」の
      // 先読み推測が乗っていることがある。早期確定の判断材料として呼び出し側に渡す
      const last = event.results[event.results.length - 1];
      callbacks.onTranscript(text, !!last?.isFinal);
    };

    try {
      recognition.start();
    } catch (e) {
      clientLogger.error('speech:start_failed', 'Speech recognition start failed', { err: e });
      active = false;
      queueMicrotask(() => callbacks.onError?.('start-failed'));
    }

    return {
      stop: () => {
        if (!active) return;
        active = false;
        // abort() を使用することで、Edge等での不要な後追いイベントを遮断
        try { recognition.abort(); } catch { /* 停止済み */ }
      },
    };
  },
};
