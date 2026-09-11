'use client';

import { useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatDateEn } from '@gabby/lib/date/dateEn';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { acceptRescheduleProposal, declineRescheduleProposals } from '@/actions/sessionAction';
import { IncomingRescheduleProposalGroup } from '@gabby/types/session';

interface RescheduleProposalRequestCardProps {
  group: IncomingRescheduleProposalGroup;
  onResolved: (sessionId: string) => void;
}

export function RescheduleProposalRequestCard({ group, onResolved }: RescheduleProposalRequestCardProps) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [respondingProposalId, setRespondingProposalId] = useState<string | null>(null);
  const [isDeclining, setIsDeclining] = useState(false);
  const { showToast } = useToast();

  const isBusy = respondingProposalId !== null || isDeclining;

  const handleAccept = async (proposalId: string) => {
    setRespondingProposalId(proposalId);
    try {
      const result = await acceptRescheduleProposal(proposalId);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(group.session_id);
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
      onResolved(group.session_id);
      showToast('Declined the proposed times.', 'success');
    } finally {
      setIsDeclining(false);
    }
  };

  return (
    <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-800">{group.student_name}</p>
          <p className="text-xs text-slate-500 mt-0.5">Proposed reschedule candidates for their cancelled session</p>
          <p className="text-[10px] text-slate-400 mt-1">
            Originally scheduled for {formatDateEn(group.original_session_start_datetime, timezone)}
          </p>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 bg-amber-50 text-amber-700 border-amber-200">
          Pending
        </span>
      </div>

      <div className="space-y-2">
        {group.candidates.map((candidate) => (
          <div key={candidate.proposal_id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg border border-slate-100 px-3 py-2">
            <span className="text-xs font-semibold text-slate-700">{formatDateEn(candidate.proposed_start_datetime, timezone)}</span>
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
    </article>
  );
}
