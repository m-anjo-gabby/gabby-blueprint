'use client';

import { useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { formatZonedDate } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { approveMatchingRequest, rejectMatchingRequest } from '@/actions/matchingRequestAction';
import { IncomingMatchingRequestItem, MATCHING_REQUEST_STATUS } from '@gabby/types/matching';
import { DAY_OF_WEEK_LABEL_EN } from '@/constants/availability';
import { DayOfWeek } from '@gabby/types/coachAvailability';

const STATUS_BADGE: Record<number, { label: string; className: string }> = {
  [MATCHING_REQUEST_STATUS.PENDING]: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  [MATCHING_REQUEST_STATUS.APPROVED]: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  [MATCHING_REQUEST_STATUS.REJECTED]: { label: 'Rejected', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  [MATCHING_REQUEST_STATUS.CANCELLED]: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

interface MatchingRequestCardProps {
  request: IncomingMatchingRequestItem;
  onResolved: (requestId: string, patch: Partial<IncomingMatchingRequestItem>) => void;
}

export function MatchingRequestCard({ request, onResolved }: MatchingRequestCardProps) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const badge = STATUS_BADGE[request.status];
  const isPending = request.status === MATCHING_REQUEST_STATUS.PENDING;

  const handleApprove = async () => {
    const ok = await showConfirm(
      'Approve this request?',
      `This will book every lesson for ${request.student_name} on ${DAY_OF_WEEK_LABEL_EN[request.requested_day_of_week as DayOfWeek]} ${formatTimeRange(request.requested_start_time, request.requested_end_time)} for the remaining license period.`,
      { variant: 'info' }
    );
    if (!ok) return;

    setIsApproving(true);
    try {
      const result = await approveMatchingRequest(request.request_id);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(request.request_id, { status: MATCHING_REQUEST_STATUS.APPROVED });
      showToast('Request approved. Sessions have been booked.', 'success');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      showToast('Please enter a reason for rejecting this request.', 'error');
      return;
    }
    setIsRejecting(true);
    try {
      const result = await rejectMatchingRequest(request.request_id, rejectReason);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(request.request_id, { status: MATCHING_REQUEST_STATUS.REJECTED, reject_reason: rejectReason.trim() });
      setShowRejectDialog(false);
      setRejectReason('');
      showToast('Request rejected.', 'success');
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-800">{request.student_name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Slot {request.slot_no} &middot; {DAY_OF_WEEK_LABEL_EN[request.requested_day_of_week as DayOfWeek]}{' '}
            {formatTimeRange(request.requested_start_time, request.requested_end_time)}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Requested {formatZonedDate(request.insert_date, timezone)}</p>
        </div>
        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {request.status === MATCHING_REQUEST_STATUS.REJECTED && request.reject_reason && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{request.reject_reason}</p>
      )}

      {isPending && (
        <div className="flex items-center gap-2 pt-1">
          <Button type="button" size="sm" onClick={handleApprove} disabled={isApproving || isRejecting}>
            {isApproving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowRejectDialog(true)}
            disabled={isApproving || isRejecting}
          >
            <X size={14} />
            Reject
          </Button>
        </div>
      )}

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              Let {request.student_name} know why this slot doesn&apos;t work. This reason will be shown to them.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. This time slot is no longer available. Please choose another time."
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowRejectDialog(false)} disabled={isRejecting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleReject} disabled={isRejecting}>
              {isRejecting && <Loader2 size={14} className="animate-spin" />}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
