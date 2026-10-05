/**
 * 再生→発話の流れで使う、中断（AbortSignal）対応の小さな部品。
 */

/** 指定時間待つ。途中で中断されたら false（中断済みなら即座に false） */
export function waitFor(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (ms <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 発話の前に順番に再生する音声（基本文・問題文など）。
 * text が無いものは再生しないが、onPrompt（画面の表示切替）は呼ぶ。
 */
export interface SpeakingPrompt<K extends string = string> {
  key: K;
  text: string | null;
  audioPath: string | null;
}

export interface PromptFailure<K extends string = string> {
  prompt: SpeakingPrompt<K>;
  error: unknown;
}

export interface PlayPromptsResult<K extends string = string> {
  aborted: boolean;
  /** 再生できなかった音声（音声ファイルが無い・取得失敗等）。再生できなくても残りは続けて再生する */
  failures: PromptFailure<K>[];
}

export type SpeakingTurnResult<R, K extends string = string> =
  | { status: 'aborted' }
  | { status: 'promptFailed'; failures: PromptFailure<K>[] }
  | { status: 'answered'; result: R | null };
