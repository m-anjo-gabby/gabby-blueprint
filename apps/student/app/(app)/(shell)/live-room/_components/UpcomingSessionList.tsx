'use client';

import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoachAvatar } from '@/components/session/CoachAvatar';
import { formatSessionSlot } from '@/lib/sessionFormat';
import { useIncrementalReveal } from '@gabby/lib/hooks/useIncrementalReveal';
import { MyBookingRequestItem, SessionListItem } from '@gabby/types/session';

const PAGE_SIZE = 5;

type UpcomingItem =
  | { kind: 'session'; startIso: string; session: SessionListItem }
  | { kind: 'request'; startIso: string; request: MyBookingRequestItem };

interface Props {
  sessions: SessionListItem[];
  requests: MyBookingRequestItem[];
  timezone: string;
  withdrawingRequestId: string | null;
  onCancelSession: (session: SessionListItem) => void;
  onWithdrawRequest: (requestId: string) => void;
}

/** 今後の予定。確定済みのセッションと、コーチの承認待ちの予約リクエストを日時順に並べる */
export function UpcomingSessionList({ sessions, requests, timezone, withdrawingRequestId, onCancelSession, onWithdrawRequest }: Props) {
  const items: UpcomingItem[] = [
    ...sessions.map((session) => ({ kind: 'session' as const, startIso: session.start_datetime, session })),
    ...requests.map((request) => ({ kind: 'request' as const, startIso: request.requested_start_datetime, request })),
  ].sort((a, b) => a.startIso.localeCompare(b.startIso));
  const reveal = useIncrementalReveal(items, PAGE_SIZE);

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-xs">
        {reveal.visibleItems.map((item) => {
          if (item.kind === 'request') {
            const { request } = item;
            const slot = formatSessionSlot(request.requested_start_datetime, request.requested_end_datetime, timezone);
            return (
              <li key={request.request_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-ink-subtle">
                  <Clock size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 font-semibold text-ink-soft tabular-nums">
                    <span className="text-sm">{slot.date}</span>
                    <span className="text-[13px]">{slot.time}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">
                    <span className="mr-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-strong">承認待ち</span>
                    {request.coach_name} コーチ
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-ink-muted"
                  pending={withdrawingRequestId === request.request_id}
                  onClick={() => onWithdrawRequest(request.request_id)}
                >
                  取り下げる
                </Button>
              </li>
            );
          }

          const { session } = item;
          const slot = formatSessionSlot(session.start_datetime, session.end_datetime, timezone);
          return (
            <li key={session.session_id} className="flex items-center gap-3 px-4 py-3">
              <CoachAvatar iconPath={session.counterpart_icon_path} size={36} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 font-semibold text-ink tabular-nums">
                  <span className="text-sm">{slot.date}</span>
                  <span className="text-[13px]">{slot.time}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">{session.counterpart_name} コーチ</p>
              </div>
              <Button type="button" size="sm" variant="ghost" className="shrink-0 text-ink-muted" onClick={() => onCancelSession(session)}>
                キャンセル
              </Button>
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
