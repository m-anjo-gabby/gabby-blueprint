/**
 * ブラウザ標準の音声合成（Web Speech API の speechSynthesis）の安全な呼び出し。
 * Android の WebView・一部のアプリ内ブラウザ・自動テストの WebKit 等では speechSynthesis 自体が
 * 存在しないため、直接 window.speechSynthesis.xxx() を呼ぶと例外で画面ごとエラーになる
 * （特にアンマウント時のクリーンアップで呼ぶと、画面遷移のたびにエラー画面になる）。
 * 読み上げ・停止はこのモジュール経由で行うこと。
 */

/** 音声合成が使える場合はその実体を返す（SSR・非対応環境では null） */
export function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis ?? null;
}

/** 読み上げ中・待機中の発話をすべて止める（非対応環境では何もしない） */
export function cancelSpeech(): void {
  getSpeechSynthesis()?.cancel();
}

/**
 * iOS Safari の自動再生制限の解除用に、ユーザー操作の中で空の発話を再生する（非対応環境では何もしない）
 */
export function primeSpeechSynthesis(): void {
  const synth = getSpeechSynthesis();
  if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
    synth.speak(new SpeechSynthesisUtterance(''));
  }
}
