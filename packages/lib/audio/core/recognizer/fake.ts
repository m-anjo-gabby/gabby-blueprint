import type { RecognitionCallbacks, RecognitionHandle, RecognitionStartOptions, SpeechRecognizerEngine } from './types';

/**
 * E2E・動作確認用の認識方式（マイクを使わない）。
 * 使われる条件は recognizer/index.ts の getSpeechRecognizer を参照（本番ビルドでは利用者が切り替えられない）。
 * テストは addInitScript 等で window.__gabbyFakeSpeech を設定する。文字起こしは transcript、
 * 未設定なら参照文をそのまま返す（＝満点の発話）。
 */
interface FakeSpeechConfig {
  transcript?: string;
  /** 認識開始から文字起こしを返すまでの時間（ms） */
  delayMs?: number;
  /** 設定されていれば、認識の開始ごとに参照文を記録する（テストで「何を発話評価したか・いつ始まったか」を確かめる） */
  log?: Array<{ type: string; text?: string }>;
}

function readRawConfig(): FakeSpeechConfig | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __gabbyFakeSpeech?: FakeSpeechConfig }).__gabbyFakeSpeech;
}

function readConfig(): FakeSpeechConfig {
  return readRawConfig() ?? {};
}

/** テストが fake の認識を要求しているか（window.__gabbyFakeSpeech が設定されているか） */
export function isFakeSpeechRequested(): boolean {
  return readRawConfig() !== undefined;
}

export const fakeSpeechRecognizer: SpeechRecognizerEngine = {
  name: 'fake',

  isSupported: () => true,

  start(options: RecognitionStartOptions, callbacks: RecognitionCallbacks): RecognitionHandle {
    let active = true;
    const config = readConfig();
    config.log?.push({ type: 'listen', text: options.referenceText });
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
