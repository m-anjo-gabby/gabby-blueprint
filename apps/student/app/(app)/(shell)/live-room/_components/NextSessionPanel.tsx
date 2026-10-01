'use client';

import { Button } from '@/components/ui/button';
import { CoachAvatar } from '@/components/session/CoachAvatar';
import { JoinSessionButton } from '@/components/session/JoinSessionButton';
import { formatSessionSlot } from '@/lib/sessionFormat';
import { SessionListItem } from '@gabby/types/session';
import { ShellSectionTitle } from '@/components/shell/ShellPage';
import { PreviousSessionLink, PreviousSessionSummary } from './PreviousSessionLink';

interface Props {
  session: SessionListItem;
  timezone: string;
  /** 前回のセッション（宿題の再確認・内容の振り返り用の導線をカード下部に出す） */
  previous: PreviousSessionSummary | null;
  onCancel: () => void;
}

/**
 * 次回のセッション。入室ボタンは常に押せる状態で表示し、押した時に入室できるかを判定する（JoinSessionButton）。
 * 次回に向けた準備として、前回のセッション結果（宿題・内容）への導線を同じカードの下部に置く
 */
export function NextSessionPanel({ session, timezone, previous, onCancel }: Props) {
  const slot = formatSessionSlot(session.start_datetime, session.end_datetime, timezone);

  return (
    <div>
      <ShellSectionTitle>次回のセッション</ShellSectionTitle>
      <section className="rounded-card border border-line bg-surface p-5 sm:p-6 shadow-xs">
        <p className="flex flex-wrap items-baseline gap-x-2.5 font-bold text-ink tabular-nums">
          <span className="text-xl sm:text-2xl">{slot.date}</span>
          <span className="text-base sm:text-lg">{slot.time}</span>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <CoachAvatar iconPath={session.counterpart_icon_path} size={28} />
          <p className="truncate text-sm text-ink-muted">{session.counterpart_name} コーチ</p>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-start">
          <JoinSessionButton sessionId={session.session_id} startDatetime={session.start_datetime} />
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
