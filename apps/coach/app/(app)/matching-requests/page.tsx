import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getPendingIncomingRequestsForCoach, getMatchingRequestHistoryPage } from '@/actions/matchingRequestAction';
import { getBookingRequestHistoryPage, getRescheduleProposalHistoryPage } from '@/actions/sessionAction';
import { MatchingRequestsView } from './_components/MatchingRequestsView';

const HISTORY_PAGE_SIZE = 10;

export default async function MatchingRequestsPage() {
  const [pendingRequests, matchingHistory, bookingHistory, rescheduleHistory] = await Promise.all([
    getPendingIncomingRequestsForCoach(),
    getMatchingRequestHistoryPage(null, HISTORY_PAGE_SIZE),
    getBookingRequestHistoryPage(null, HISTORY_PAGE_SIZE),
    getRescheduleProposalHistoryPage(null, HISTORY_PAGE_SIZE),
  ]);

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <Link href="/calendar" className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 mb-2">
          <ArrowLeft size={12} />
          Back to Calendar
        </Link>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Requests</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Requests from your students — fixed weekly slot matching, new session bookings, and reschedule candidates
          they proposed when cancelling a session. Review and approve or decline each one here.
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <MatchingRequestsView
          initialPendingRequests={pendingRequests}
          initialMatchingHistory={matchingHistory}
          initialBookingHistory={bookingHistory}
          initialRescheduleHistory={rescheduleHistory}
        />
      </div>
    </div>
  );
}
