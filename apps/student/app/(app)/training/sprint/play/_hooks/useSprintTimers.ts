'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * スプリント（タイムモード）専用：制限時間のカウントダウンを管理する。
 * secondsLeft が0になった時点で onTimeUp を呼び出す。secondsLeftRef は
 * 毎秒変化する値を再生成の少ないコールバック内から安全に参照するためのもの。
 */
export function useSprintCountdown(timeLimitSec: number, onTimeUp: () => void, onUnmount?: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number>(timeLimitSec || 60);

  const secondsLeftRef = useRef<number>(secondsLeft);
  useEffect(() => { secondsLeftRef.current = secondsLeft; }, [secondsLeft]);

  // 全体の残り制限時間カウント。
  // 💡 interval はマウント時に一度だけ生成し、functional update で毎秒デクリメントする
  // （secondsLeft を依存配列に入れて毎秒 setInterval/clearInterval を繰り返す実装は不要な再生成コストになる）
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // タイムアップ判定
  useEffect(() => {
    if (secondsLeft <= 0) {
      onTimeUp();
    }
  }, [secondsLeft, onTimeUp]);

  // アンマウント時のクリーンアップ。
  // 💡 timeLimitSec は useState の初期化子で既に反映済み（このフックは呼び出し元の
  // プレイヤーが毎セッションごとに新規マウントされる前提のため、マウント中の再同期は不要）
  useEffect(() => {
    return () => {
      onUnmount?.();
    };
  }, [onUnmount]);

  return { secondsLeft, secondsLeftRef };
}

/**
 * タイムアップ完了オーバーレイ表示中、数秒後に自動で結果画面へ遷移するカウントダウン。
 * trigger が true になった瞬間から countdownSeconds 秒のカウントダウン表示を開始し、
 * redirectDelayMs 後に onRedirect を呼び出す。
 */
export function useAutoRedirectCountdown(
  trigger: boolean,
  onRedirect: () => void,
  opts?: { countdownSeconds?: number; redirectDelayMs?: number },
) {
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const countdownSeconds = opts?.countdownSeconds ?? 3;
  const redirectDelayMs = opts?.redirectDelayMs ?? 3500;

  useEffect(() => {
    if (!trigger) return;

    setRedirectCountdown(countdownSeconds);

    const interval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev === null || prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const timer = setTimeout(() => {
      onRedirect();
    }, redirectDelayMs);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, onRedirect]);

  return redirectCountdown;
}
