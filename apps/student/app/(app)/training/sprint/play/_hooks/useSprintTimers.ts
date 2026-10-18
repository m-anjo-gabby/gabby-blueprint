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
  useEffect(() => {
    secondsLeftRef.current = secondsLeft;
  }, [secondsLeft]);

  // 全体の残り制限時間カウント。
  // interval はマウント時に一度だけ生成し、functional update で毎秒デクリメントする
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
  // timeLimitSec は useState の初期化子で既に反映済み（このフックは呼び出し元の
  // プレイヤーが毎セッションごとに新規マウントされる前提のため、マウント中の再同期は不要）
  useEffect(() => {
    return () => {
      onUnmount?.();
    };
  }, [onUnmount]);

  return { secondsLeft, secondsLeftRef };
}

/**
 * タイムアップ完了オーバーレイ表示中、数秒後に自動で結果画面へ遷移する。
 * trigger が true になってから redirectDelayMs 後に onRedirect を呼び出す。
 */
export function useAutoRedirectCountdown(
  trigger: boolean,
  onRedirect: () => void,
  opts?: { redirectDelayMs?: number },
) {
  const redirectDelayMs = opts?.redirectDelayMs ?? 3500;

  useEffect(() => {
    if (!trigger) return;
    const timer = setTimeout(() => {
      onRedirect();
    }, redirectDelayMs);
    return () => clearTimeout(timer);
  }, [trigger, onRedirect, redirectDelayMs]);
}
