'use client';

import { useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { acceptRescheduleProposal, declineRescheduleProposals } from '@/actions/sessionAction';
import { IncomingRescheduleProposalGroup, RESCHEDULE_PROPOSAL_STATUS } from '@gabby/types/session';
import { RequestKindTag } from './RequestKindTag';

interface RescheduleProposalRequestCardProps {
  group: IncomingRescheduleProposalGroup;
  onResolved: (sessionId: string, patch: Partial<IncomingRescheduleProposalGroup>) => void;
}

export function RescheduleProposalRequestCard({ group, onResolved }: RescheduleProposalRequestCardProps) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [respondingProposalId, setRespondingProposalId] = useState<string | null>(null);
  const [isDeclining, setIsDeclining] = useState(false);
  const { showToast } = useToast();

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
      // サーバー側(accept_session_reschedule_proposal RPC)は承諾した候補以外のpending候補を
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
          <div className="space-y-2">
            {pendingCandidates.map((candidate) => (
              <div key={candidate.proposal_id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg border border-slate-100 px-3 py-2">
                <span className="text-xs font-semibold text-slate-700">{formatDateTimeEn(candidate.proposed_start_datetime, timezone)}</span>
                <Button type="button" size="sm" className="h-7 px-2.5 text-[11px]" disabled={isBusy} onClick={() => handleAccept(candidate.proposal_id)}>
                  {respondingProposalId === candidate.proposal_id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Book this time
                </Button>
              </div>
            ))}
          </div>

          <div className="pt-1">
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
