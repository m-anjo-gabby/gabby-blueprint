'use client';

import { useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { acceptRescheduleProposal, declineRescheduleProposals } from '@/actions/sessionAction';
import { IncomingRescheduleProposalGroup, RESCHEDULE_PROPOSAL_STATUS } from '@gabby/types/session';
import { cn } from '@/lib/utils';
import { RequestKindTag } from './RequestKindTag';

interface RescheduleProposalRequestCardProps {
  group: IncomingRescheduleProposalGroup;
  onResolved: (sessionId: string, patch: Partial<IncomingRescheduleProposalGroup>) => void;
  /** カレンダーと並べて表示する場合、候補日をホバー時にハイライトするためのコールバック */
  onDateHover?: (date: string | null) => void;
}

export function RescheduleProposalRequestCard({ group, onResolved, onDateHover }: RescheduleProposalRequestCardProps) {
  const timezone = useTimezone();
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [respondingProposalId, setRespondingProposalId] = useState<string | null>(null);
  const [isDeclining, setIsDeclining] = useState(false);
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const isBusy = respondingProposalId !== null || isDeclining;
  const pendingCandidates = group.candidates.filter((c) => c.status === RESCHEDULE_PROPOSAL_STATUS.PENDING);
  const acceptedCandidate = group.candidates.find((c) => c.status === RESCHEDULE_PROPOSAL_STATUS.ACCEPTED);
  const isPending = pendingCandidates.length > 0;

  const handleAccept = async (proposalId: string) => {
    setRespondingProposalId(proposalId);
    try {
      const result = await acceptRescheduleProposal(proposalId);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      // サーバー側(approve_slot_proposal RPC)は承諾した候補以外のpending候補を
      // 自動でdeclined化するため、ここでも同じ結果をローカルに反映してHistoryへ即時反映する
      const resolvedCandidates = group.candidates.map((c) =>
        c.proposal_id === proposalId
          ? { ...c, status: RESCHEDULE_PROPOSAL_STATUS.ACCEPTED }
          : c.status === RESCHEDULE_PROPOSAL_STATUS.PENDING
            ? { ...c, status: RESCHEDULE_PROPOSAL_STATUS.DECLINED }
            : c
      );
      onResolved(group.session_id, { candidates: resolvedCandidates });
      showToast('Booked the selected time.', 'success');
    } finally {
      setRespondingProposalId(null);
    }
  };

  const handleDeclineAll = async () => {
    const ok = await showConfirm(
      'Decline all proposed times?',
      `This will decline all ${pendingCandidates.length} time${pendingCandidates.length > 1 ? 's' : ''} ${group.student_name} proposed. They'll need to propose new times.`,
      { variant: 'danger', confirmText: 'Decline all', cancelText: 'Cancel' }
    );
    if (!ok) return;

    setIsDeclining(true);
    try {
      const result = await declineRescheduleProposals(group.session_id);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      const resolvedCandidates = group.candidates.map((c) =>
        c.status === RESCHEDULE_PROPOSAL_STATUS.PENDING ? { ...c, status: RESCHEDULE_PROPOSAL_STATUS.DECLINED } : c
      );
      onResolved(group.session_id, { candidates: resolvedCandidates });
      showToast('Declined the proposed times.', 'success');
    } finally {
      setIsDeclining(false);
    }
  };

  return (
    <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <RequestKindTag kind="reschedule_proposal" />
          <p className="text-sm font-black text-slate-800 mt-1.5">{group.student_name}</p>
          <p className="text-xs text-slate-500 mt-0.5">Proposed reschedule candidates for their cancelled session</p>
          <p className="text-[10px] text-slate-400 mt-1">
            Originally scheduled for {formatDateTimeEn(group.original_session_start_datetime, timezone)}
          </p>
        </div>
        {isPending ? (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 bg-amber-50 text-amber-700 border-amber-200">
            Pending
          </span>
        ) : acceptedCandidate ? (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 bg-emerald-50 text-emerald-700 border-emerald-200">
            Booked
          </span>
        ) : (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 bg-slate-100 text-slate-600 border-slate-200">
            Declined
          </span>
        )}
      </div>

      {isPending ? (
        <>
          <div className="space-y-2" role="radiogroup" aria-label="Proposed times">
            {pendingCandidates.map((candidate) => {
              const isSelected = selectedProposalId === candidate.proposal_id;
              return (
                <label
                  key={candidate.proposal_id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                    isSelected ? 'bg-brand-50 border-brand-300' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                  )}
                  onMouseEnter={() => onDateHover?.(toIsoDateInZone(candidate.proposed_start_datetime, timezone))}
                  onMouseLeave={() => onDateHover?.(null)}
                >
                  <input
                    type="radio"
                    name={`reschedule-proposal-${group.session_id}`}
                    className="h-3.5 w-3.5 accent-brand"
                    checked={isSelected}
                    disabled={isBusy}
                    onChange={() => setSelectedProposalId(candidate.proposal_id)}
                  />
                  <span className="text-xs font-semibold text-slate-700">{formatDateTimeEn(candidate.proposed_start_datetime, timezone)}</span>
                </label>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              disabled={isBusy || !selectedProposalId}
              onClick={() => selectedProposalId && handleAccept(selectedProposalId)}
            >
              {respondingProposalId ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Book selected time
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
              disabled={isBusy}
              onClick={handleDeclineAll}
            >
              {isDeclining ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              Decline all
            </Button>
          </div>
        </>
      ) : acceptedCandidate ? (
        <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          Booked {formatDateTimeEn(acceptedCandidate.proposed_start_datetime, timezone)}
        </p>
      ) : (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">All candidates were declined</p>
      )}
    </article>
  );
}
