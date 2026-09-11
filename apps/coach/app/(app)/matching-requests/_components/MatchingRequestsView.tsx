'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MatchingRequestCard } from './MatchingRequestCard';
import { BookingRequestCard } from './BookingRequestCard';
import { RescheduleProposalRequestCard } from './RescheduleProposalRequestCard';
import { CoachIncomingRequestItem, IncomingSessionBookingRequestItem, isPendingCoachIncomingRequest } from '@gabby/types/coachInbox';
import { IncomingMatchingRequestItem } from '@gabby/types/matching';
import { IncomingRescheduleProposalGroup } from '@gabby/types/session';
import { useIncrementalReveal } from '@gabby/lib/hooks/useIncrementalReveal';

const HISTORY_PAGE_SIZE = 10;

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

  const { pending, history } = useMemo(() => {
    const pending = requests.filter(isPendingCoachIncomingRequest);
    const history = requests.filter((r) => !isPendingCoachIncomingRequest(r));
    return { pending, history };
  }, [requests]);

  // Historyは承認・拒否等が積み重なり件数が増え続けるため、最初はHISTORY_PAGE_SIZE件だけ
  // 表示し、ボタン押下で追加表示する
  const historyReveal = useIncrementalReveal(history, HISTORY_PAGE_SIZE);

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
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">History ({history.length})</h2>
          <div className="space-y-3">{historyReveal.visibleItems.map(renderItem)}</div>
          {historyReveal.hasMore && (
            <Button type="button" variant="outline" className="w-full" onClick={historyReveal.showMore}>
              Show {historyReveal.remainingCount} more
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
