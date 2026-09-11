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
import { formatDateEn, formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { approveSessionBookingRequest, rejectSessionBookingRequest } from '@/actions/sessionAction';
import { SESSION_BOOKING_REQUEST_STATUS } from '@gabby/types/session';
import { IncomingSessionBookingRequestItem } from '@gabby/types/coachInbox';
import { RequestKindTag } from './RequestKindTag';

const STATUS_BADGE: Record<number, { label: string; className: string }> = {
  [SESSION_BOOKING_REQUEST_STATUS.PENDING]: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  [SESSION_BOOKING_REQUEST_STATUS.APPROVED]: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  [SESSION_BOOKING_REQUEST_STATUS.REJECTED]: { label: 'Rejected', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  [SESSION_BOOKING_REQUEST_STATUS.WITHDRAWN]: { label: 'Withdrawn', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

interface BookingRequestCardProps {
  request: IncomingSessionBookingRequestItem;
  onResolved: (requestId: string, patch: Partial<IncomingSessionBookingRequestItem>) => void;
}

export function BookingRequestCard({ request, onResolved }: BookingRequestCardProps) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const badge = STATUS_BADGE[request.status];
  const isPending = request.status === SESSION_BOOKING_REQUEST_STATUS.PENDING;

  const handleApprove = async () => {
    const ok = await showConfirm(
      'Approve this booking request?',
      `This will book a new session with ${request.student_name} on ${formatDateTimeEn(request.requested_start_datetime, timezone)}.`,
      { variant: 'info', confirmText: 'Approve', cancelText: 'Cancel' }
    );
    if (!ok) return;

    setIsApproving(true);
    try {
      const result = await approveSessionBookingRequest(request.request_id);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(request.request_id, { status: SESSION_BOOKING_REQUEST_STATUS.APPROVED });
      showToast('Request approved. The session has been booked.', 'success');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      const result = await rejectSessionBookingRequest(request.request_id, rejectReason || undefined);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(request.request_id, { status: SESSION_BOOKING_REQUEST_STATUS.REJECTED, reject_reason: rejectReason.trim() || null });
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
          <RequestKindTag kind="booking" />
          <p className="text-sm font-black text-slate-800 mt-1.5">{request.student_name}</p>
          <p className="text-[11px] font-bold text-slate-600 mt-1">{formatDateTimeEn(request.requested_start_datetime, timezone)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Requested {formatDateEn(request.insert_date, timezone)}</p>
          {request.reason && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2 mt-1.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Reason</p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap">{request.reason}</p>
            </div>
          )}
        </div>
        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {request.status === SESSION_BOOKING_REQUEST_STATUS.REJECTED && request.reject_reason && (
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
            <DialogTitle>Reject Booking Request</DialogTitle>
            <DialogDescription>
              Let {request.student_name} know why this time doesn&apos;t work (optional).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. I'm not available at this time. Please choose another time."
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
