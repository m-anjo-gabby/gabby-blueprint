'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { acceptRescheduleProposal, declineRescheduleProposals } from '@/actions/sessionAction';
import { MyRescheduleProposalGroup } from '@gabby/types/session';

interface Props {
  group: MyRescheduleProposalGroup | null;
  timezone: string;
  onClose: () => void;
  onAccepted: (sessionId: string) => void;
  onDeclined: (sessionId: string) => void;
}

export function RescheduleProposalDialog({ group, timezone, onClose, onAccepted, onDeclined }: Props) {
  const { showToast } = useToast();
  const [respondingProposalId, setRespondingProposalId] = useState<string | null>(null);
  const [isDeclining, setIsDeclining] = useState(false);

  const isBusy = respondingProposalId !== null || isDeclining;

  const handleAccept = async (proposalId: string) => {
    if (!group) return;
    setRespondingProposalId(proposalId);
    try {
      const result = await acceptRescheduleProposal(proposalId);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      showToast('新しいセッションを予約しました。', 'success');
      onAccepted(group.session_id);
    } finally {
      setRespondingProposalId(null);
    }
  };

  const handleDeclineAll = async () => {
    if (!group) return;
    setIsDeclining(true);
    try {
      const result = await declineRescheduleProposals(group.session_id);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      showToast('候補を却下しました。', 'success');
      onDeclined(group.session_id);
    } finally {
      setIsDeclining(false);
    }
  };

  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && !isBusy && onClose()}>
      <DialogContent>
        {group && (
          <>
            <DialogHeader>
              <DialogTitle>振替候補</DialogTitle>
              <DialogDescription>
                {group.coach_name}コーチからの振替候補です。ご希望の時間を1つ選んで承認してください。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {group.candidates.map((candidate) => (
                <div
                  key={candidate.proposal_id}
                  className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg border border-slate-100 px-3 py-2.5"
                >
                  <span className="text-sm font-semibold text-slate-700">
                    {formatDateTimeByZone(candidate.proposed_start_datetime, timezone, false)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2.5 text-[11px]"
                    disabled={isBusy}
                    onClick={() => handleAccept(candidate.proposal_id)}
                  >
                    {respondingProposalId === candidate.proposal_id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={12} />
                    )}
                    承認
                  </Button>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>
                閉じる
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                disabled={isBusy}
                onClick={handleDeclineAll}
              >
                {isDeclining && <Loader2 size={14} className="animate-spin" />}
                いずれも却下する
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
