import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * ハイドレーションが完了したか（サーバー描画時・ハイドレーション中は false、以後は true）。
 *
 * サーバーとクライアントで描画結果が一致しない部品を、ハイドレーション後にだけ描画するために使う。
 * 例: Radix Switch は内部の非表示 input の style がサーバー/クライアントで一致せず、
 * React 19 でハイドレーション不一致の警告が出る。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
