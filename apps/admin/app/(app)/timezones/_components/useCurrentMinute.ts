import { useSyncExternalStore } from 'react';

/**
 * 分単位で更新される現在時刻（エポックミリ秒）を共有するストア。
 * 購読者が何件いてもタイマーは1本のみ。分の境界に合わせて更新する。
 */
const listeners = new Set<() => void>();
let currentMinute = floorToMinute(Date.now());
let timer: ReturnType<typeof setTimeout> | null = null;

function floorToMinute(ms: number): number {
  return ms - (ms % 60_000);
}

function scheduleTick() {
  const now = Date.now();
  timer = setTimeout(() => {
    currentMinute = floorToMinute(Date.now());
    listeners.forEach((listener) => listener());
    scheduleTick();
  }, 60_000 - (now % 60_000));
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    currentMinute = floorToMinute(Date.now());
    scheduleTick();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/**
 * 現在時刻（分単位）を返す。
 * サーバー描画・ハイドレーション時は null を返すため、時刻差によるハイドレーション不一致が起きない。
 */
export function useCurrentMinute(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => currentMinute,
    () => null,
  );
}
