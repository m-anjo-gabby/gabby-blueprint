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

    const resetScroll = (shouldStopMomentum = false) => {
      const htmlEl = document.documentElement;
      const bodyEl = document.body;
      const prevScrollBehavior = htmlEl.style.scrollBehavior;
      
      let prevHtmlOverflow = '';
      let prevBodyOverflow = '';
      let prevHtmlPosition = '';
      let prevHtmlTop = '';
      let prevHtmlHeight = '';
      let prevHtmlWidth = '';
      let prevBodyPosition = '';
      let prevBodyTop = '';
      let prevBodyHeight = '';
      let prevBodyWidth = '';

      if (shouldStopMomentum) {
        // 現在のスタイルを退避
        prevHtmlOverflow = htmlEl.style.overflow;
        prevBodyOverflow = bodyEl.style.overflow;
        prevHtmlPosition = htmlEl.style.position;
        prevHtmlTop = htmlEl.style.top;
        prevHtmlHeight = htmlEl.style.height;
        prevHtmlWidth = htmlEl.style.width;
        prevBodyPosition = bodyEl.style.position;
        prevBodyTop = bodyEl.style.top;
        prevBodyHeight = bodyEl.style.height;
        prevBodyWidth = bodyEl.style.width;

        // position: fixed 等を適用してバウンス物理と慣性を強制シャットダウン
        htmlEl.style.overflow = 'hidden';
        htmlEl.style.position = 'fixed';
        htmlEl.style.top = '0';
        htmlEl.style.height = '100%';
        htmlEl.style.width = '100%';

        bodyEl.style.overflow = 'hidden';
        bodyEl.style.position = 'fixed';
        bodyEl.style.top = '0';
        bodyEl.style.height = '100%';
        bodyEl.style.width = '100%';
      }

      // scroll-behavior: smooth が設定されていると即時リセットが効かないため一時的に auto に変更
      htmlEl.style.scrollBehavior = 'auto';

      // window + html + body の三重リセット（iOS Safari 対応）
      window.scrollTo(0, 0);
      htmlEl.scrollTop = 0;
      bodyEl.scrollTop = 0;

      // data-scroll-container を持つ子コンテナも全てリセット
      document
        .querySelectorAll<HTMLElement>('[data-scroll-container]')
        .forEach((el) => {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        });

      const restoreScrollStyles = () => {
        if (shouldStopMomentum) {
          // スタイルを復元
          htmlEl.style.overflow = prevHtmlOverflow;
          htmlEl.style.position = prevHtmlPosition;
          htmlEl.style.top = prevHtmlTop;
          htmlEl.style.height = prevHtmlHeight;
          htmlEl.style.width = prevHtmlWidth;

          bodyEl.style.overflow = prevBodyOverflow;
          bodyEl.style.position = prevBodyPosition;
          bodyEl.style.top = prevBodyTop;
          bodyEl.style.height = prevBodyHeight;
          bodyEl.style.width = prevBodyWidth;
        }
        htmlEl.style.scrollBehavior = prevScrollBehavior;

        // iOS Safari のビューポート座標ズレを解消するための微小スクロールハック
        // 1px だけ強制的にスクロールさせて戻すことで、ブラウザに再レイアウト・座標同期を強制します。
        const currentScrollY = window.scrollY;
        const targetScrollY = currentScrollY === 0 ? 1 : currentScrollY - 1;
        window.scrollTo(window.scrollX, targetScrollY);
        window.scrollTo(window.scrollX, currentScrollY);
      };

      if (shouldStopMomentum) {
        // 次のレンダリングフレームでスタイルを復元し、座標を再同期させる
        requestAnimationFrame(restoreScrollStyles);
      } else {
        restoreScrollStyles();
      }
    };

    // 即時実行（遷移直後・慣性停止あり）
    resetScroll(true);

    // requestAnimationFrame でペイント後にも再実行（慣性停止あり）
    const rafId = requestAnimationFrame(() => resetScroll(true));

    // キーボードの閉じるアニメーション（通常約300ms）や
    // 非同期データの読み込み・レンダリング完了をカバーするための遅延実行（慣性停止は不要）
    const delays = [100, 300, 600];
    const timerIds = delays.map((delay) => 
      setTimeout(() => resetScroll(false), delay)
    );

    return () => {
      cancelAnimationFrame(rafId);
      timerIds.forEach(clearTimeout);
    };
  }, [pathname, searchParams]);

  return null;
}
