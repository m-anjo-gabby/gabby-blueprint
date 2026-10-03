import { fakeSpeechRecognizer } from './fake';
import { webSpeechRecognizer } from './webSpeech';
import type { SpeechRecognizerEngine } from './types';

export type { SpeechRecognizerEngine, RecognitionCallbacks, RecognitionHandle, RecognitionStartOptions } from './types';

/** 使用する認識方式。既定は Web Speech API。NEXT_PUBLIC_SPEECH_RECOGNIZER=fake の場合だけテスト用に切り替える */
export function getSpeechRecognizer(): SpeechRecognizerEngine {
  if (process.env.NEXT_PUBLIC_SPEECH_RECOGNIZER === 'fake') return fakeSpeechRecognizer;
  return webSpeechRecognizer;
}
