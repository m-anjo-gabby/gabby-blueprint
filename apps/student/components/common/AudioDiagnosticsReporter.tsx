'use client';

import { useEffect } from 'react';
import { setAudioDiagnosticsReporter } from '@gabby/lib/audio/core/audioRuntime';
import { clientLogger } from '@gabby/lib/logger/client';

/**
 * 音声の中断・復旧の発生状況（iOS の放置・バックグラウンド・通話等）をサーバーのログへ送る。
 * どの画面・どの状況で起き、どの手段で直ったか（自動・タップ・失敗）を後から確かめるため（表示は持たない）。
 * 記録の内容は packages/lib/audio/core/audioRuntime.ts の report を参照。
 */
export function AudioDiagnosticsReporter() {
  useEffect(() => {
    setAudioDiagnosticsReporter(({ event, level, detail }) => {
      clientLogger[level](event, event, { payload: detail });
    });
    return () => setAudioDiagnosticsReporter(null);
  }, []);

  return null;
}
