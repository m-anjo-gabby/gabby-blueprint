'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Lesson Sprint専用：制限時間のカウントダウン＋一時停止/再開を管理する。
 * 生徒アプリの useSprintCountdown（apps/student/.../useSprintTimers.ts）と同じく
 * intervalはマウント時に一度だけ生成し、functional updateで毎秒デクリメントする方針を踏襲。
 * 一時停止中は interval 自体は動かし続けたまま、コールバック内で
 * デクリメントをスキップするガード方式にすることで再生成コストを避ける。
 */
export function useLessonSprintCountdown(timeLimitSec: number, onTimeUp: () => void, started: boolean = true) {
  const [secondsLeft, setSecondsLeft] = useState<number>(timeLimitSec || 60);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const secondsLeftRef = useRef<number>(secondsLeft);
  useEffect(() => { secondsLeftRef.current = secondsLeft; }, [secondsLeft]);

  const isPausedRef = useRef<boolean>(false);
  const pauseStartedAtRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef<number>(0);
  // 保存時に読み取る、一時停止していた合計秒数。resume() のたびに更新される安定した ref。
  // 呼び出し側はコールバック内で pausedSecondsRef.current を読むだけでよく、
  // フック呼び出し順序（宣言前参照）を気にせず安全に使える。
  const pausedSecondsRef = useRef<number>(0);

  // 開始前インストラクション画面の間はタイマーを進行させないためのガード。
  const startedRef = useRef<boolean>(started);
  useEffect(() => { startedRef.current = started; }, [started]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!startedRef.current || isPausedRef.current) return;
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

  useEffect(() => {
    if (secondsLeft <= 0) {
      onTimeUp();
    }
  }, [secondsLeft, onTimeUp]);

  const pause = () => {
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    pauseStartedAtRef.current = Date.now();
    setIsPaused(true);
  };

  const resume = () => {
    if (!isPausedRef.current) return;
    isPausedRef.current = false;
    if (pauseStartedAtRef.current !== null) {
      totalPausedMsRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
    pausedSecondsRef.current = Math.round(totalPausedMsRef.current / 1000);
    setIsPaused(false);
  };

  const togglePause = () => {
    if (isPausedRef.current) resume(); else pause();
  };

  return { secondsLeft, secondsLeftRef, isPaused, pause, resume, togglePause, pausedSecondsRef };
}
