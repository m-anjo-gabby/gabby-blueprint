import { fakeSpeechRecognizer, isFakeSpeechRequested } from './fake';
import { webSpeechRecognizer } from './webSpeech';
import type { SpeechRecognizerEngine } from './types';

export type { SpeechRecognizerEngine, RecognitionCallbacks, RecognitionHandle, RecognitionStartOptions } from './types';

/**
 * 使用する認識方式。既定は Web Speech API。
 * テスト用の fake は、NEXT_PUBLIC_SPEECH_RECOGNIZER=fake の場合、または本番以外のビルドで
 * テストが window.__gabbyFakeSpeech を設定した場合だけ使う（本番ビルドの利用者が切り替えることはできない）。
 */
export function getSpeechRecognizer(): SpeechRecognizerEngine {
  if (process.env.NEXT_PUBLIC_SPEECH_RECOGNIZER === 'fake') return fakeSpeechRecognizer;
  if (process.env.NODE_ENV !== 'production' && isFakeSpeechRequested()) return fakeSpeechRecognizer;
  return webSpeechRecognizer;
}
