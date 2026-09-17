'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const CHANNEL_PREFIX = 'gabby-coach-live-session-ended';

interface UseLiveSessionEndSignalResult {
  /** 別タブ（通話ルーム）で通話が終了した通知を受け取ったか */
  hasEnded: boolean;
  /** 通話ルーム側から、同じセッションを開いている他タブ（Session Hub）へ終了を知らせる */
  notifyEnded: () => void;
}

/**
 * 同一コーチが同じセッションについて開いている「通話ルーム」タブと「Session Hub」タブの間で、
 * 通話終了を伝えるためだけの軽量な通知。在室状態そのものの共有は引き続きuseLiveSessionPresence
 * (Realtime Presence)が担っており、これはその上に追加のサーバー往復を発生させないための
 * ローカル専用チャンネル（BroadcastChannel）。同一ブラウザの別タブにしか届かない前提で良い
 * （通話ルームとHubは常に同一コーチ・同一ブラウザで開くため）。
 */
export function useLiveSessionEndSignal(sessionId: string): UseLiveSessionEndSignalResult {
  const [hasEnded, setHasEnded] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(`${CHANNEL_PREFIX}-${sessionId}`);
    channelRef.current = channel;
    channel.onmessage = () => setHasEnded(true);

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [sessionId]);

  const notifyEnded = useCallback(() => {
    channelRef.current?.postMessage('ended');
  }, []);

  return { hasEnded, notifyEnded };
}
