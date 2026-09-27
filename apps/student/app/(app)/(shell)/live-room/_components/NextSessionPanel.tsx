'use client';

import Link from 'next/link';
import { ArrowRight, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoachAvatar } from '@/components/session/CoachAvatar';
import { useNow } from '@gabby/lib/hooks/useNow';
import { LIVE_SESSION_EARLY_JOIN_BEFORE_MS } from '@gabby/lib/liveSessionRoom/constants';
import { formatSessionSlot, formatTimeUntil } from '@/lib/sessionFormat';
import { SessionListItem } from '@gabby/types/session';
import { ShellSectionTitle } from '@/components/shell/ShellPage';
import { PreviousSessionLink, PreviousSessionSummary } from './PreviousSessionLink';

const EARLY_JOIN_MINUTES = Math.round(LIVE_SESSION_EARLY_JOIN_BEFORE_MS / 60000);

interface Props {
  session: SessionListItem;
  timezone: string;
  /** 前回のセッション（宿題の再確認・内容の振り返り用の導線をカード下部に出す） */
  previous: PreviousSessionSummary | null;
  onCancel: () => void;
}

/**
 * 次回のセッション。入室ボタンは実際に入室できる時刻（開始の数分前）になってから有効にする。
 * 次回に向けた準備として、前回のセッション結果（宿題・内容）への導線を同じカードの下部に置く
 */
export function NextSessionPanel({ session, timezone, previous, onCancel }: Props) {
  const nowMs = useNow();
  const slot = formatSessionSlot(session.start_datetime, session.end_datetime, timezone);
  const startMs = new Date(session.start_datetime).getTime();
  const canJoin = nowMs !== null && nowMs >= startMs - LIVE_SESSION_EARLY_JOIN_BEFORE_MS;
  const untilStart = nowMs !== null ? formatTimeUntil(session.start_datetime, nowMs) : null;

  return (
    <div>
      <ShellSectionTitle
        aside={
          untilStart &&
          !canJoin && (
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-strong">
              開始まで{untilStart}
            </span>
          )
        }
      >
        次回のセッション
      </ShellSectionTitle>
      <section className="rounded-card border border-line bg-surface p-5 sm:p-6 shadow-xs">
        <p className="flex flex-wrap items-baseline gap-x-2.5 font-bold text-ink tabular-nums">
          <span className="text-xl sm:text-2xl">{slot.date}</span>
          <span className="text-base sm:text-lg">{slot.time}</span>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <CoachAvatar iconPath={session.counterpart_icon_path} size={28} />
          <p className="truncate text-sm text-ink-muted">{session.counterpart_name} コーチ</p>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          {canJoin ? (
            <Button asChild className="sm:min-w-40">
              <Link href={`/live-room/${session.session_id}`}>
                <Video size={16} />
                入室する
                <ArrowRight size={14} />
              </Link>
            </Button>
          ) : (
            <Button type="button" disabled className="sm:min-w-40" icon={<Video size={16} />}>
              開始{EARLY_JOIN_MINUTES}分前から入室できます
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="text-ink-muted sm:ml-auto" onClick={onCancel}>
            この回をキャンセル
          </Button>
        </div>

        {previous && (
          <div className="mt-4 border-t border-line pt-3">
            <PreviousSessionLink previous={previous} timezone={timezone} variant="embedded" />
          </div>
        )}
      </section>
    </div>
  );
}
