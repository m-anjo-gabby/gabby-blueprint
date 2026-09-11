'use client';

import { useMemo, useState } from 'react';
import { MatchingRequestCard } from './MatchingRequestCard';
import { BookingRequestCard } from './BookingRequestCard';
import { RescheduleProposalRequestCard } from './RescheduleProposalRequestCard';
import { CoachIncomingRequestItem, isPendingCoachIncomingRequest } from '@gabby/types/coachInbox';
import { IncomingMatchingRequestItem } from '@gabby/types/matching';

interface MatchingRequestsViewProps {
  initialRequests: CoachIncomingRequestItem[];
}

export function MatchingRequestsView({ initialRequests }: MatchingRequestsViewProps) {
  const [requests, setRequests] = useState<CoachIncomingRequestItem[]>(initialRequests);

  const handleMatchingResolved = (requestId: string, patch: Partial<IncomingMatchingRequestItem>) => {
    setRequests((prev) =>
      prev.map((item) => (item.kind === 'matching' && item.data.request_id === requestId ? { ...item, data: { ...item.data, ...patch } } : item))
    );
  };

  const handleBookingResolved = (requestId: string) => {
    setRequests((prev) => prev.filter((item) => !(item.kind === 'booking' && item.data.request_id === requestId)));
  };

  const handleProposalResolved = (sessionId: string) => {
    setRequests((prev) => prev.filter((item) => !(item.kind === 'reschedule_proposal' && item.data.session_id === sessionId)));
  };

  const { pending, history } = useMemo(() => {
    const pending = requests.filter(isPendingCoachIncomingRequest);
    const history = requests.filter((r) => !isPendingCoachIncomingRequest(r));
    return { pending, history };
  }, [requests]);

  const renderItem = (item: CoachIncomingRequestItem) => {
    switch (item.kind) {
      case 'matching':
        return <MatchingRequestCard key={`matching-${item.data.request_id}`} request={item.data} onResolved={handleMatchingResolved} />;
      case 'booking':
        return <BookingRequestCard key={`booking-${item.data.request_id}`} request={item.data} onResolved={handleBookingResolved} />;
      case 'reschedule_proposal':
        return (
          <RescheduleProposalRequestCard key={`proposal-${item.data.session_id}`} group={item.data} onResolved={handleProposalResolved} />
        );
    }
  };

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-200">
        <p className="text-sm font-bold text-slate-500">No requests yet</p>
        <p className="text-[11px] text-slate-400 mt-1.5">Requests from your students will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-xs font-black text-indigo-500 uppercase tracking-widest">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">No pending requests.</p>
        ) : (
          <div className="space-y-3">{pending.map(renderItem)}</div>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">History</h2>
          <div className="space-y-3">{history.map(renderItem)}</div>
        </section>
      )}
    </div>
  );
}
