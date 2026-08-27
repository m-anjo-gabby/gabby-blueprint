'use client';

import { useEffect } from 'react';

/**
 * 指定した間隔で syncFn を定期実行する汎用フック。
 * アンマウント時にタイマーを解除する。
 */
export function usePeriodicSync(syncFn: () => void, intervalMs: number) {
  useEffect(() => {
    const intervalId = setInterval(() => {
      syncFn();
    }, intervalMs);
    return () => clearInterval(intervalId);
  }, [syncFn, intervalMs]);
}
