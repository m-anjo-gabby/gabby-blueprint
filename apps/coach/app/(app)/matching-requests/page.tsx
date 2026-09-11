import { getIncomingRequestsForCoach } from '@/actions/matchingRequestAction';
import { MatchingRequestsView } from './_components/MatchingRequestsView';

export default async function MatchingRequestsPage() {
  const requests = await getIncomingRequestsForCoach();

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Requests</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Requests from your students — fixed weekly slot matching, new session bookings, and reschedule candidates
          they proposed when cancelling a session. Review and approve or decline each one here.
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <MatchingRequestsView initialRequests={requests} />
      </div>
    </div>
  );
}
