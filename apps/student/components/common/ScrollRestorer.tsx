'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function ScrollRestorer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 1. window全体のスクロール位置をゼロクリア
      window.scrollTo(0, 0);
      
      // 2. html / body 要素のスクロール位置も確実にクリア（iOS Safari等のタップ座標ズレ防止）
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      // 3. 遅延発生するレンダリングやレイアウト処理に対応するため、微小遅延後に二重でリセットをかける
      const timer = setTimeout(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  return null;
}
