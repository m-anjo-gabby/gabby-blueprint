'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '../../supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RealtimeChannel = any;

type LiveSessionRole = 'coach' | 'student';

interface UseLiveSessionPresenceResult {
  /** コーチが現在このセッションのRealtimeチャンネルに在室しているか */
  isCoachPresent: boolean;
  /** 生徒が現在このセッションのRealtimeチャンネルに在室しているか */
  isStudentPresent: boolean;
  /** 自分の在室をこのチャンネルにtrackする（Zoomセッションへのjoin成功後に呼ぶ） */
  trackSelf: (role: LiveSessionRole) => Promise<void>;
  /** 自分の在室をuntrackする（退室・アンマウント時に呼ぶ） */
  untrackSelf: () => Promise<void>;
}

/**
 * コーチ⇔生徒のライブセッションルームの「在室状態」をSupabase Realtime Presenceで共有する。
 * DBへの永続化を伴わない一時的な状態のため、専用テーブルは持たずPresenceのみで完結させる。
 * チャンネルはコーチ・生徒で決定的な sessionName（buildSessionName生成値）をキーに揃える。
 */
export function useLiveSessionPresence(sessionName: string): UseLiveSessionPresenceResult {
  const [isCoachPresent, setIsCoachPresent] = useState(false);
  const [isStudentPresent, setIsStudentPresent] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase.channel(`live-session-presence-${sessionName}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });
    channelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, Array<{ role: LiveSessionRole }>>;
      const roles = new Set(Object.values(state).flat().map((entry) => entry.role));
      setIsCoachPresent(roles.has('coach'));
      setIsStudentPresent(roles.has('student'));
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [sessionName]);

  const trackSelf = useCallback(async (role: LiveSessionRole) => {
    await channelRef.current?.track({ role });
  }, []);

  const untrackSelf = useCallback(async () => {
    await channelRef.current?.untrack();
  }, []);

  return { isCoachPresent, isStudentPresent, trackSelf, untrackSelf };
}
