'use client';

import { MatchingRequestCard } from '@/components/requests/MatchingRequestCard';
import { BookingRequestCard } from '@/components/requests/BookingRequestCard';
import { RescheduleProposalRequestCard } from '@/components/requests/RescheduleProposalRequestCard';
import { RequestHistoryTabs } from './RequestHistoryTabs';
import { useCoachPendingRequests } from '@/hooks/useCoachPendingRequests';
import { CoachIncomingRequestItem, IncomingSessionBookingRequestItem } from '@gabby/types/coachInbox';
import { IncomingMatchingRequestItem } from '@gabby/types/matching';
import { IncomingRescheduleProposalGroup } from '@gabby/types/session';

interface HistoryPage<T> {
  items: T[];
  nextCursor: string | null;
}

interface MatchingRequestsViewProps {
  initialPendingRequests: CoachIncomingRequestItem[];
  initialMatchingHistory: HistoryPage<IncomingMatchingRequestItem>;
  initialBookingHistory: HistoryPage<IncomingSessionBookingRequestItem>;
  initialRescheduleHistory: HistoryPage<IncomingRescheduleProposalGroup>;
}

export function MatchingRequestsView({
  initialPendingRequests,
  initialMatchingHistory,
  initialBookingHistory,
  initialRescheduleHistory,
}: MatchingRequestsViewProps) {
  const { pending, handleMatchingResolved, handleBookingResolved, handleProposalResolved } =
    useCoachPendingRequests(initialPendingRequests);

  const renderPendingItem = (item: CoachIncomingRequestItem) => {
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

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-xs font-black text-indigo-500 uppercase tracking-widest">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">No pending requests.</p>
        ) : (
          <div className="space-y-3">{pending.map(renderPendingItem)}</div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">History</h2>
        <RequestHistoryTabs
          initialMatching={initialMatchingHistory}
          initialBooking={initialBookingHistory}
          initialReschedule={initialRescheduleHistory}
        />
      </section>
    </div>
  );
}
