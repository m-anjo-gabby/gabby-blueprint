'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { MatchingRequestCard } from '@/components/requests/MatchingRequestCard';
import { BookingRequestCard } from '@/components/requests/BookingRequestCard';
import { RescheduleProposalRequestCard } from '@/components/requests/RescheduleProposalRequestCard';
import { CoachIncomingRequestItem, IncomingSessionBookingRequestItem, isPendingCoachIncomingRequest } from '@gabby/types/coachInbox';
import { IncomingMatchingRequestItem } from '@gabby/types/matching';
import { IncomingRescheduleProposalGroup } from '@gabby/types/session';

interface PendingRequestsPanelProps {
  initialRequests: CoachIncomingRequestItem[];
  onDateHover?: (date: string | null) => void;
}

export function PendingRequestsPanel({ initialRequests, onDateHover }: PendingRequestsPanelProps) {
  const [requests, setRequests] = useState<CoachIncomingRequestItem[]>(initialRequests);

  const handleMatchingResolved = (requestId: string, patch: Partial<IncomingMatchingRequestItem>) => {
    setRequests((prev) =>
      prev.map((item) => (item.kind === 'matching' && item.data.request_id === requestId ? { ...item, data: { ...item.data, ...patch } } : item))
    );
  };

  const handleBookingResolved = (requestId: string, patch: Partial<IncomingSessionBookingRequestItem>) => {
    setRequests((prev) =>
      prev.map((item) => (item.kind === 'booking' && item.data.request_id === requestId ? { ...item, data: { ...item.data, ...patch } } : item))
    );
  };

  const handleProposalResolved = (sessionId: string, patch: Partial<IncomingRescheduleProposalGroup>) => {
    setRequests((prev) =>
      prev.map((item) => (item.kind === 'reschedule_proposal' && item.data.session_id === sessionId ? { ...item, data: { ...item.data, ...patch } } : item))
    );
  };

  const pending = useMemo(() => requests.filter(isPendingCoachIncomingRequest), [requests]);

  const renderItem = (item: CoachIncomingRequestItem) => {
    switch (item.kind) {
      case 'matching':
        return (
          <MatchingRequestCard
            key={`matching-${item.data.request_id}`}
            request={item.data}
            onResolved={handleMatchingResolved}
            onDateHover={onDateHover}
          />
        );
      case 'booking':
        return (
          <BookingRequestCard
            key={`booking-${item.data.request_id}`}
            request={item.data}
            onResolved={handleBookingResolved}
            onDateHover={onDateHover}
          />
        );
      case 'reschedule_proposal':
        return (
          <RescheduleProposalRequestCard
            key={`proposal-${item.data.session_id}`}
            group={item.data}
            onResolved={handleProposalResolved}
            onDateHover={onDateHover}
          />
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col max-h-[70vh] lg:max-h-none lg:h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
        <h2 className="text-xs font-black text-indigo-500 uppercase tracking-widest">Pending Requests ({pending.length})</h2>
        <Link href="/matching-requests" className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 shrink-0">
          History
          <ArrowRight size={12} />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm font-bold text-slate-500">No pending requests</p>
            <p className="text-[11px] text-slate-400 mt-1">You&apos;re all caught up.</p>
          </div>
        ) : (
          pending.map(renderItem)
        )}
      </div>
    </div>
  );
}
