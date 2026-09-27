'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CoachAvatar } from '@/components/session/CoachAvatar';
import { ShellSectionTitle } from '@/components/shell/ShellPage';
import { formatSessionSlot } from '@/lib/sessionFormat';
import { useIncrementalReveal } from '@gabby/lib/hooks/useIncrementalReveal';
import { useHydrated } from '@gabby/lib/hooks/useHydrated';
import { SESSION_STATUS, SessionListItem } from '@gabby/types/session';
import { getSessionStatusBadge } from '@/constants/session';

const PAGE_SIZE = 10;

function StatusBadge({ session }: { session: SessionListItem }) {
  const badge = getSessionStatusBadge(session);
  return <span className={cn('shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold', badge.className)}>{badge.label}</span>;
}

function HistoryRow({ session, timezone }: { session: SessionListItem; timezone: string }) {
  const slot = formatSessionSlot(session.start_datetime, session.end_datetime, timezone);
  const body = (
    <>
      <CoachAvatar iconPath={session.counterpart_icon_path} size={32} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold tabular-nums">
          <span>{slot.date}</span>
          <span className="text-xs font-normal">{slot.time}</span>
        </p>
        {/* ステータスは長い表記（「キャンセル済み（コーチ都合）」等）があるため、日時を圧迫しないよう2段目に置く */}
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <StatusBadge session={session} />
          <p className="min-w-0 truncate text-xs text-ink-muted">{session.counterpart_name} コーチ</p>
        </div>
        {session.cancel_reason && <p className="mt-1 line-clamp-2 text-xs text-ink-muted">理由：{session.cancel_reason}</p>}
      </div>
    </>
  );

  if (session.status === SESSION_STATUS.CANCELLED) {
    return <div className="flex items-center gap-3 px-4 py-3 text-ink-muted">{body}</div>;
  }
  return (
    <Link
      href={`/live-room/sessions/${session.session_id}/result`}
      className="flex items-center gap-3 px-4 py-3 text-ink hover:bg-canvas transition-colors"
    >
      {body}
      <ChevronRight size={16} className="shrink-0 text-ink-subtle" />
    </Link>
  );
}

interface Props {
  /** 実施済みと、生徒・コーチ本人によるキャンセルを開始日時の降順で渡す */
  sessions: SessionListItem[];
  timezone: string;
}

/**
 * 履歴。既定では結果画面へ進める実施済みだけを表示し、キャンセルはスイッチで同じ時系列に重ねて表示する
 * （キャンセルが積み重なっても、結果画面へのアクセスの邪魔にならないようにする）。
 */
export function SessionHistoryList({ sessions, timezone }: Props) {
  const switchId = useId();
  const hydrated = useHydrated();
  const [showCancelled, setShowCancelled] = useState(false);
  const cancelledCount = sessions.filter((s) => s.status === SESSION_STATUS.CANCELLED).length;
  const visibleSessions = showCancelled ? sessions : sessions.filter((s) => s.status !== SESSION_STATUS.CANCELLED);
  const reveal = useIncrementalReveal(visibleSessions, PAGE_SIZE);

  const handleToggle = (checked: boolean) => {
    setShowCancelled(checked);
    reveal.reset();
  };

  return (
    <div>
      <ShellSectionTitle
        aside={
          cancelledCount > 0 && (
            <div className="flex items-center gap-2">
              <Label htmlFor={switchId} className="text-xs font-normal text-ink-muted">
                キャンセルも表示（{cancelledCount}件）
              </Label>
              {/* Radix Switchはサーバー/クライアントで非表示inputのstyleが一致しないため、ハイドレーション後に描画する */}
              {hydrated ? (
                <Switch id={switchId} checked={showCancelled} onCheckedChange={handleToggle} />
              ) : (
                <span aria-hidden className="h-5 w-9 rounded-full bg-line" />
              )}
            </div>
          )
        }
      >
        履歴
      </ShellSectionTitle>

      {visibleSessions.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-4 py-8 text-center">
          <p className="text-sm text-ink-muted">実施済みのセッションはまだありません</p>
          {cancelledCount > 0 && <p className="mt-1 text-xs text-ink-subtle">キャンセルの記録は「キャンセルも表示」で確認できます</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-xs">
            {reveal.visibleItems.map((session) => (
              <li key={session.session_id}>
                <HistoryRow session={session} timezone={timezone} />
              </li>
            ))}
          </ul>
          {reveal.hasMore && (
            <Button type="button" size="sm" variant="outline" className="w-full" onClick={reveal.showMore}>
              さらに{reveal.remainingCount}件を表示
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
