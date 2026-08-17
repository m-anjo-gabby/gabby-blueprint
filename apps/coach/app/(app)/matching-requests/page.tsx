import { getIncomingRequests } from '@/actions/matchingRequestAction';
import { MatchingRequestsView } from './_components/MatchingRequestsView';

export default async function MatchingRequestsPage() {
  const requests = await getIncomingRequests();

  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Matching Requests</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Students requesting a fixed weekly lesson slot with you. Approving a request automatically books every session for the license period.
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <MatchingRequestsView initialRequests={requests} />
      </div>
    </div>
  );
}
