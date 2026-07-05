'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * ScrollRestorer
 *
 * 画面遷移時のスクロール位置ズレ（特に iOS Safari のタップ座標ズレ）を防ぐコンポーネント。
 *
 * ## 問題の根本原因
 * iOS Safari では、ページがスクロールされた状態で画面遷移すると、
 * ブラウザのビューポート座標系とレイアウト座標系がずれたまま残る。
 * その結果、タップ位置と実際のヒットターゲットがズレるバグが発生する。
 *
 * ## 解決策
 * 1. scroll-behavior を一時的に 'auto' にしてから即時リセット
 * 2. window / html / body の三重リセット
 * 3. requestAnimationFrame でペイント後に再確認（iOS Safari の非同期無視対策）
 * 4. [data-scroll-container] 属性を持つ子コンテナも一括リセット
 */
export default function ScrollRestorer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 同一パスへの遷移（クエリ変更のみ）はリセットしない
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;

    const resetScroll = () => {
      // scroll-behavior: smooth が設定されていると即時リセットが効かないため一時的に auto に変更
      const htmlEl = document.documentElement;
      const prevScrollBehavior = htmlEl.style.scrollBehavior;
      htmlEl.style.scrollBehavior = 'auto';

      // window + html + body の三重リセット（iOS Safari 対応）
      window.scrollTo(0, 0);
      htmlEl.scrollTop = 0;
      document.body.scrollTop = 0;

      // data-scroll-container を持つ子コンテナも全てリセット
      document
        .querySelectorAll<HTMLElement>('[data-scroll-container]')
        .forEach((el) => {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        });

      // scroll-behavior を元に戻す
      htmlEl.style.scrollBehavior = prevScrollBehavior;
    };

    // 即時実行（遷移直後）
    resetScroll();

    // requestAnimationFrame でペイント後にも再実行
    // iOS Safari では最初の scrollTo が無視されるケースがあるため二重実行する
    const rafId = requestAnimationFrame(resetScroll);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [pathname, searchParams]);

  return null;
}
