import type { RecognitionCallbacks, RecognitionHandle, RecognitionStartOptions, SpeechRecognizerEngine } from './types';

/**
 * E2E・動作確認用の認識方式（マイクを使わない）。
 * NEXT_PUBLIC_SPEECH_RECOGNIZER=fake でビルド・起動した場合だけ使われる（本番では使われない）。
 * 文字起こしは window.__gabbyFakeSpeech.transcript（テストから addInitScript 等で設定）、
 * 未設定なら参照文をそのまま返す（＝満点の発話）。
 */
interface FakeSpeechConfig {
  transcript?: string;
  /** 認識開始から文字起こしを返すまでの時間（ms） */
  delayMs?: number;
}

function readConfig(): FakeSpeechConfig {
  if (typeof window === 'undefined') return {};
  return (window as unknown as { __gabbyFakeSpeech?: FakeSpeechConfig }).__gabbyFakeSpeech ?? {};
}

export const fakeSpeechRecognizer: SpeechRecognizerEngine = {
  name: 'fake',

  isSupported: () => true,

  start(options: RecognitionStartOptions, callbacks: RecognitionCallbacks): RecognitionHandle {
    let active = true;
    const config = readConfig();
    const startTimer = setTimeout(() => {
      if (active) callbacks.onStart?.();
    }, 50);
    const resultTimer = setTimeout(() => {
      if (active) callbacks.onTranscript(config.transcript ?? options.referenceText ?? '', true);
    }, config.delayMs ?? 400);

    return {
      stop: () => {
        active = false;
        clearTimeout(startTimer);
        clearTimeout(resultTimer);
      },
    };
  },
};
