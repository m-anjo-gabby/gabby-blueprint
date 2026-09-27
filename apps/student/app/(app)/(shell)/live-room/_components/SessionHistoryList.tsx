'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CoachAvatar } from '@/components/session/CoachAvatar';
import { formatSessionSlot } from '@/lib/sessionFormat';
import { useIncrementalReveal } from '@gabby/lib/hooks/useIncrementalReveal';
import { SESSION_STATUS, SessionListItem } from '@gabby/types/session';
import { getSessionStatusBadge } from '@/constants/session';

const PAGE_SIZE = 10;

function StatusBadge({ session }: { session: SessionListItem }) {
  const badge = getSessionStatusBadge(session);
  return <span className={cn('shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold', badge.className)}>{badge.label}</span>;
}

interface Props {
  /** 実施済みと、生徒・コーチ本人によるキャンセルを開始日時の降順で渡す */
  sessions: SessionListItem[];
  timezone: string;
}

/**
 * 履歴。実施済みはタップでセッション結果へ遷移し、キャンセルは同じ時系列に控えめな行として並べる
 * （「コーチ都合でキャンセル → 振替」のような前後関係を1つの流れで読めるようにする）。
 */
export function SessionHistoryList({ sessions, timezone }: Props) {
  const reveal = useIncrementalReveal(sessions, PAGE_SIZE);

  if (sessions.length === 0) {
    return <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">まだ履歴はありません</p>;
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-xs">
        {reveal.visibleItems.map((session) => {
          const slot = formatSessionSlot(session.start_datetime, session.end_datetime, timezone);
          const body = (
            <>
              <CoachAvatar iconPath={session.counterpart_icon_path} size={32} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold tabular-nums">
                  <span>{slot.date}</span>
                  <span className="text-xs font-normal">{slot.time}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">{session.counterpart_name} コーチ</p>
                {session.cancel_reason && <p className="mt-1 line-clamp-2 text-xs text-ink-muted">理由：{session.cancel_reason}</p>}
              </div>
              <StatusBadge session={session} />
            </>
          );

          return (
            <li key={session.session_id}>
              {session.status === SESSION_STATUS.CANCELLED ? (
                <div className="flex items-center gap-3 px-4 py-3 text-ink-muted">{body}</div>
              ) : (
                <Link
                  href={`/live-room/sessions/${session.session_id}/result`}
                  className="flex items-center gap-3 px-4 py-3 text-ink hover:bg-canvas transition-colors"
                >
                  {body}
                  <ChevronRight size={16} className="shrink-0 text-ink-subtle" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {reveal.hasMore && (
        <Button type="button" size="sm" variant="outline" className="w-full" onClick={reveal.showMore}>
          さらに{reveal.remainingCount}件を表示
        </Button>
      )}
    </div>
  );
}
