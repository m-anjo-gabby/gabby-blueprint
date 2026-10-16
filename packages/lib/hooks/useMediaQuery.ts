'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * メディアクエリに一致するかを返す（画面幅で部品そのものを切り替える場合に使う）。
 * 見た目だけの出し分けは Tailwind のブレークポイントで足りるため、このフックは使わない。
 * サーバー描画とハイドレーション中は false（＝狭い画面）として扱い、その後ブラウザの値に置き換わる。
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
