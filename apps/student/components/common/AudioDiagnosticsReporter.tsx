'use client';

import { useEffect } from 'react';
import { setAudioDiagnosticsReporter } from '@gabby/lib/audio/core/audioRuntime';
import { logClientEvent } from '@gabby/lib/logger/actions';

/**
 * 音声の中断・復旧の発生状況（iOS の放置・バックグラウンド・通話等）をサーバーのログへ送る。
 * どの画面・どの状況で起き、どの手段で直ったか（自動・タップ・失敗）を後から確かめるため（表示は持たない）。
 * 記録の内容は packages/lib/audio/core/audioRuntime.ts の report を参照。
 */
export function AudioDiagnosticsReporter() {
  useEffect(() => {
    setAudioDiagnosticsReporter(({ event, level, detail }) => {
      logClientEvent({ service: 'student', event, level, message: event, payload: detail }).catch(() => {
        /* ログ送信自体の失敗は利用者の操作に影響させない */
      });
    });
    return () => setAudioDiagnosticsReporter(null);
  }, []);

  return null;
}
