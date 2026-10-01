'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, TriangleAlert, Video } from 'lucide-react';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { LIVE_SESSION_EARLY_JOIN_BEFORE_MS } from '@gabby/lib/liveSessionRoom/constants';
import { checkLiveSessionJoinable } from '@/actions/videoSessionAction';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const EARLY_JOIN_MINUTES = Math.round(LIVE_SESSION_EARLY_JOIN_BEFORE_MS / 60000);

const formatAvailableAt = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  );

interface JoinSessionButtonProps {
  sessionId: string;
  startDatetime: string;
  className?: string;
}

/**
 * ライブセッションの入室ボタン（ホームのライブセッションのカードと、ライブセッション管理の次回のセッションで共有する）。
 * 表示時刻に依存して押せなくなることを避けるため、ボタンは常に押せる状態で表示し、押した時に判定する。
 * - 端末の時刻で入室できる時刻なら、そのまま入室画面へ遷移する（往復を増やさない）
 * - 端末の時刻で「まだ早い」場合だけサーバーの時刻で確かめ、入室できれば遷移、まだならその場に案内を出す
 *   （端末の時計が遅れている場合に、入室できるのに止めてしまわないため）
 * どちらの場合も、最終的な判定は入室画面がサーバーで行う（Zoom の署名はその判定の後でしか発行されない）。
 */
export function JoinSessionButton({ sessionId, startDatetime, className }: JoinSessionButtonProps) {
  const router = useRouter();
  const timezone = useTimezone();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const roomPath = `/live-room/${sessionId}`;

  const handleClick = () => {
    setNotice(null);
    startTransition(async () => {
      if (Date.now() >= new Date(startDatetime).getTime() - LIVE_SESSION_EARLY_JOIN_BEFORE_MS) {
        router.push(roomPath);
        return;
      }
      const result = await checkLiveSessionJoinable(sessionId);
      if (result.status === 'joinable') {
        router.push(roomPath);
        return;
      }
      setNotice(result.status === 'too_early' ? `${formatAvailableAt(result.availableAt, timezone)}から入室できます。` : result.message);
    });
  };

  return (
    <div className={className}>
      <Button type="button" onClick={handleClick} pending={isPending} icon={<Video size={16} />} className="w-full sm:w-auto sm:min-w-40">
        入室する
      </Button>
      <p
        role={notice ? 'alert' : undefined}
        className={cn('mt-2 flex items-center gap-1 text-xs', notice ? 'font-semibold text-amber-700' : 'text-ink-muted')}
      >
        {notice ? <TriangleAlert size={12} className="shrink-0" /> : <Clock size={12} className="shrink-0" />}
        {notice ?? `開始${EARLY_JOIN_MINUTES}分前から入室できます`}
      </p>
    </div>
  );
}
