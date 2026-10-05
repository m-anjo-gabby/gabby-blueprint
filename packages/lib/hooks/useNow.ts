import { useSyncExternalStore } from 'react';

/**
 * 現在時刻(ms)を一定間隔で更新して返すフック。
 *
 * サーバー描画時と初回ハイドレーション時は null を返すため、時刻に依存する表示
 * （挨拶・入室可否など）でサーバー/クライアント間の不一致が起きない。
 * 利用側は null の間はプレースホルダーを表示すること。
 * 複数コンポーネントから呼ばれてもタイマーは1本だけ共有する。
 */
const TICK_MS = 30 * 1000;

let nowSnapshot = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  if (!timer) {
    nowSnapshot = Date.now();
    timer = setInterval(() => {
      nowSnapshot = Date.now();
      listeners.forEach((listener) => listener());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
};

const getSnapshot = () => nowSnapshot;
const getServerSnapshot = () => null;

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
