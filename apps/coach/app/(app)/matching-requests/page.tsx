import { getPendingIncomingRequestsForCoach, getMatchingRequestHistoryPage } from '@/actions/matchingRequestAction';
import { getBookingRequestHistoryPage, getRescheduleProposalHistoryPage } from '@/actions/sessionAction';
import { MatchingRequestsView } from './_components/MatchingRequestsView';
import { RequestsPageHeader } from '@/components/common/ToolPageSkeletons';

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
      <RequestsPageHeader />

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
