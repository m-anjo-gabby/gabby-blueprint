'use client';

import { useState } from 'react';
import { CalendarClock, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useNow } from '@gabby/lib/hooks/useNow';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { formatSessionSlot, formatTimeUntil } from '@/lib/sessionFormat';
import { acceptRescheduleProposal, declineRescheduleProposals } from '@/actions/sessionAction';
import { MyRescheduleProposalGroup } from '@gabby/types/session';

interface Props {
  group: MyRescheduleProposalGroup;
  timezone: string;
  onAccepted: () => void;
  /** 候補を見送った後、自分で日時をリクエストできるよう予約リクエストダイアログを開く */
  onDeclined: () => void;
}

/**
 * コーチ都合のキャンセルで届いた振替候補。何が起きたか（元の予定）・回答期限・候補を1枚にまとめ、
 * 候補を選んでその場で確定できるようにする。候補が合わない場合は見送って自分でリクエストする導線を出す。
 */
export function RescheduleProposalCard({ group, timezone, onAccepted, onDeclined }: Props) {
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const nowMs = useNow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const isBusy = isAccepting || isDeclining;

  const original = formatSessionSlot(group.original_session_start_datetime, group.original_session_end_datetime, timezone);
  const expiresAt = group.candidates.reduce(
    (earliest, c) => (c.expires_at < earliest ? c.expires_at : earliest),
    group.candidates[0]?.expires_at ?? ''
  );
  const remaining = nowMs !== null && expiresAt ? formatTimeUntil(expiresAt, nowMs) : null;

  const handleAccept = async () => {
    if (!selectedId) return;
    setIsAccepting(true);
    try {
      const result = await acceptRescheduleProposal(selectedId);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      showToast('振替のセッションを予約しました。', 'success');
      onAccepted();
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = async () => {
    const confirmed = await showConfirm(
      '候補をすべて見送りますか？',
      'この回は未予約として残ります。続けて、ご希望の日時をコーチにリクエストできます。',
      { variant: 'warning', confirmText: '見送る', cancelText: '候補から選ぶ' }
    );
    if (!confirmed) return;

    setIsDeclining(true);
    try {
      const result = await declineRescheduleProposals(group.session_id);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onDeclined();
    } finally {
      setIsDeclining(false);
    }
  };

  return (
    <section className="rounded-card border border-amber-200 bg-surface p-4 sm:p-5 shadow-xs">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-amber-50 text-amber-600">
          <CalendarClock size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">{group.coach_name}コーチの都合でキャンセルになりました</p>
          <p className="mt-1 text-xs text-ink-muted tabular-nums">
            元の予定：<span className="line-through">{original.date} {original.time}</span>
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs font-semibold text-ink-soft">振替の候補から1つ選んでください</p>
      <div role="radiogroup" aria-label="振替候補" className="mt-2 space-y-2">
        {group.candidates.map((candidate) => {
          const slot = formatSessionSlot(candidate.proposed_start_datetime, candidate.proposed_end_datetime, timezone);
          const selected = selectedId === candidate.proposal_id;
          return (
            <button
              key={candidate.proposal_id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isBusy}
              onClick={() => setSelectedId(candidate.proposal_id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-control border px-3.5 py-3 text-left transition-colors disabled:opacity-60',
                selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand-200'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  selected ? 'border-brand bg-brand text-white' : 'border-line bg-surface'
                )}
              >
                {selected && <Check size={12} strokeWidth={3} />}
              </span>
              <span className="flex flex-wrap items-baseline gap-x-2 font-bold text-ink tabular-nums">
                <span className="text-sm">{slot.date}</span>
                <span className="text-[13px]">{slot.time}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" size="sm" className="text-ink-muted" pending={isDeclining} disabled={isAccepting} onClick={handleDecline}>
          候補以外の日時を希望する
        </Button>
        <Button type="button" pending={isAccepting} disabled={!selectedId || isDeclining} onClick={handleAccept}>
          この日時で予約する
        </Button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
        回答期限：{formatDateTimeByZone(expiresAt, timezone, false)}
        {remaining && <span className="font-semibold text-amber-700">（あと{remaining}）</span>}
        。期限を過ぎると候補は無効になり、この回は未予約として残ります。
      </p>
    </section>
  );
}
