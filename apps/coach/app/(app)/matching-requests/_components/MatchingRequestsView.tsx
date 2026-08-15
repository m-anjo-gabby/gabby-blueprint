'use client';

import { useMemo, useState } from 'react';
import { MatchingRequestCard } from './MatchingRequestCard';
import { IncomingMatchingRequestItem, MATCHING_REQUEST_STATUS } from '@gabby/types/matching';

interface MatchingRequestsViewProps {
  initialRequests: IncomingMatchingRequestItem[];
}

export function MatchingRequestsView({ initialRequests }: MatchingRequestsViewProps) {
  const [requests, setRequests] = useState<IncomingMatchingRequestItem[]>(initialRequests);

  const handleResolved = (requestId: string, patch: Partial<IncomingMatchingRequestItem>) => {
    setRequests((prev) => prev.map((r) => (r.request_id === requestId ? { ...r, ...patch } : r)));
  };

  const { pending, history } = useMemo(() => {
    const pending = requests.filter((r) => r.status === MATCHING_REQUEST_STATUS.PENDING);
    const history = requests.filter((r) => r.status !== MATCHING_REQUEST_STATUS.PENDING);
    return { pending, history };
  }, [requests]);

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-200">
        <p className="text-sm font-bold text-slate-500">No matching requests yet</p>
        <p className="text-[11px] text-slate-400 mt-1.5">Students will appear here once they request a lesson slot with you.</p>
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
          <div className="space-y-3">
            {pending.map((request) => (
              <MatchingRequestCard key={request.request_id} request={request} onResolved={handleResolved} />
            ))}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">History</h2>
          <div className="space-y-3">
            {history.map((request) => (
              <MatchingRequestCard key={request.request_id} request={request} onResolved={handleResolved} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
