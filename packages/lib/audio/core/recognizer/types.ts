/**
 * 音声認識方式（エンジン）の差し替え口。
 * 評価（analyzePhrase）や画面は認識方式を意識せず、ここで定義した形で文字起こしを受け取る。
 * 端末内の音声認識や、スピーキングテスト用の評価サービス等を追加する場合も、この形に合わせて実装する。
 */

export interface RecognitionStartOptions {
  /** 認識する言語（BCP 47） */
  lang: string;
  /** 読み上げる予定の文（参照文）。参照文を使う方式（発音評価サービス・テスト用の方式）向け */
  referenceText?: string;
}

export interface RecognitionCallbacks {
  /** 実際にマイクが開いて認識が始まった */
  onStart?: () => void;
  /** 認識中の文字起こし（開始からの全文）。isFinal は末尾の区間が確定したか */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** 継続できない失敗（権限拒否等）。呼ばれた後は認識は止まっている */
  onError?: (code: string) => void;
}

export interface RecognitionHandle {
  /** 認識を止める（何度呼んでもよい）。止めた後はコールバックを呼ばない */
  stop: () => void;
}

export interface SpeechRecognizerEngine {
  readonly name: string;
  isSupported: () => boolean;
  start: (options: RecognitionStartOptions, callbacks: RecognitionCallbacks) => RecognitionHandle;
}
