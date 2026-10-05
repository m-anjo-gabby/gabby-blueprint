import type { AnalysisResult } from '@gabby/types/speechAssessment';
import { analyzePhrase } from '../../assessment/native-speech';
import { getSpeechRecognizer, type RecognitionHandle } from './recognizer';

/**
 * 1回分の発話評価（React に依存しない）。
 * 認識方式（recognizer）から文字起こしを受け取り、自前の評価（analyzePhrase）で採点する。
 *
 * 終わり方は3つ:
 * - 制限時間・セーフティタイマー・エクセレント到達・利用者の停止（finish）→ その時点の評価で確定
 * - 中断（abort）→ 結果なし（null）。カード切替・スキップ・画面離脱等で、古い結果が後から反映されないようにする
 * - 認識の失敗（権限拒否等）→ その時点の評価で確定
 */
export interface SpeechAssessmentOptions {
  targetText: string;
  mainWords: string[];
  /** 制限時間（秒） */
  timeLimitSec?: number;
  /** 実際にマイクが開いた */
  onListening?: () => void;
  /** 残り秒数の更新（開始時に timeLimitSec、以降1秒ごと） */
  onTimeLeft?: (seconds: number) => void;
}

export interface SpeechAssessmentHandle {
  /** 確定した評価。中断した場合は null */
  result: Promise<AnalysisResult | null>;
  /** その時点の評価で確定する */
  finish: () => void;
  /** 結果を出さずに中断する */
  abort: () => void;
}

const DEFAULT_TIME_LIMIT_SEC = 10;
/** 0秒になった後、ブラウザが最後の音声を文字起こしして返すまでの猶予（Edge/Safari 対策） */
const TIME_UP_GRACE_MS = 500;
/** 何らかの理由でタイマーが進まなかった場合の最終的な打ち切り（制限時間＋猶予） */
const SAFETY_EXTRA_MS = 1500;
/** この点数以上で全単語が聞き取れていれば、制限時間を待たずに確定する */
const EXCELLENT_SCORE = 0.9;
/**
 * iOS Safari 等（単発認識）では isFinal が届かないことがあるため、
 * エクセレント到達後にこの時間だけ文字起こしが変わらなければ確定する
 */
const EXCELLENT_DEBOUNCE_MS = 350;

export function startSpeechAssessment(options: SpeechAssessmentOptions): SpeechAssessmentHandle {
  const { targetText, mainWords, timeLimitSec = DEFAULT_TIME_LIMIT_SEC, onListening, onTimeLeft } = options;

  let latest: AnalysisResult = analyzePhrase('', targetText, mainWords);
  let done = false;
  let resolveResult: (value: AnalysisResult | null) => void = () => { /* 下で差し替え */ };
  const result = new Promise<AnalysisResult | null>((resolve) => { resolveResult = resolve; });

  const timers = new Set<ReturnType<typeof setTimeout>>();
  let countdown: ReturnType<typeof setInterval> | null = null;
  let excellentTimer: ReturnType<typeof setTimeout> | null = null;
  let recognition: RecognitionHandle | null = null;

  const clearAllTimers = () => {
    timers.forEach(clearTimeout);
    timers.clear();
    if (countdown) clearInterval(countdown);
    countdown = null;
    if (excellentTimer) clearTimeout(excellentTimer);
    excellentTimer = null;
  };

  const end = (value: AnalysisResult | null) => {
    if (done) return;
    done = true;
    recognition?.stop();
    clearAllTimers();
    resolveResult(value);
  };

  const finish = (value?: AnalysisResult) => end(value ?? latest);

  recognition = getSpeechRecognizer().start(
    { lang: 'en-US', referenceText: targetText },
    {
      onStart: () => { if (!done) onListening?.(); },
      onError: () => finish(),
      onTranscript: (heard, isFinal) => {
        if (done) return;
        const analyzed = analyzePhrase(heard, targetText, mainWords);
        latest = analyzed;

        // まだ推測中の文言が変化し続けている間は確定させない
        if (excellentTimer) {
          clearTimeout(excellentTimer);
          excellentTimer = null;
        }

        // エクセレント到達時はテンポよく次に進めるため即座に確定する。
        // ただし全単語に何かしらのマッチがあるまでは確定しない（重み付けの偏りだけで閾値を超えるのを防ぐ）
        const allWordsHeard = !analyzed.matches.some((m) => !m.isMatch);
        if (analyzed.score < EXCELLENT_SCORE || !allWordsHeard) return;

        if (isFinal) {
          finish(analyzed);
          return;
        }
        excellentTimer = setTimeout(() => {
          excellentTimer = null;
          finish(analyzed);
        }, EXCELLENT_DEBOUNCE_MS);
      },
    },
  );

  let secondsLeft = timeLimitSec;
  onTimeLeft?.(secondsLeft);
  countdown = setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);
    onTimeLeft?.(secondsLeft);
    if (secondsLeft === 0) {
      if (countdown) clearInterval(countdown);
      countdown = null;
      timers.add(setTimeout(() => finish(), TIME_UP_GRACE_MS));
    }
  }, 1000);
  timers.add(setTimeout(() => finish(), timeLimitSec * 1000 + SAFETY_EXTRA_MS));

  return {
    result,
    finish: () => finish(),
    abort: () => end(null),
  };
}
