'use client';

import { useSyncExternalStore } from 'react';
import { getAudioResumeStatus, subscribeAudioResumeStatus, type AudioResumeStatus } from '../core/audioRuntime';

const getServerSnapshot = (): AudioResumeStatus => 'ok';

/** 音声再開の状態（アプリ全体で共通）。'needsResume' / 'failed' に応じて通知を出し分ける */
export function useAudioResumeStatus(): AudioResumeStatus {
  return useSyncExternalStore(subscribeAudioResumeStatus, getAudioResumeStatus, getServerSnapshot);
}
