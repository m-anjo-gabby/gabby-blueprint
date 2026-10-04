'use client';

import { useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { SCROLL_CONTAINER_ATTR } from '@/lib/scroll';

/**
 * 画面を移ったら、スクロール領域（シェルの <main>・没入画面の本文）を先頭へ戻す。
 * シェルの <main> は画面をまたいで残るため、そのままでは前の画面のスクロール位置で次の画面が表示される。
 * 同じ画面でクエリだけが変わる移動（月切替・タブ等）では戻さない。
 * ページ全体は (app)/layout.tsx で h-dvh に固定しておりスクロールしないが、iOS のキーボード表示等で
 * ずれたまま移ってきた場合に備えて、ずれている時だけページ全体も戻す。
 * 子の画面の自動スクロール（focus 指定等）より先に戻すため、描画前（useLayoutEffect）に行う。
 */
export function NavigationScrollReset() {
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    const isInitial = prevPathnameRef.current === null;
    prevPathnameRef.current = pathname;
    if (isInitial) return;

    if (window.scrollY !== 0) window.scrollTo(0, 0);
    document.querySelectorAll<HTMLElement>(`[${SCROLL_CONTAINER_ATTR}]`).forEach((el) => {
      el.scrollTop = 0;
    });
  }, [pathname]);

  return null;
}
