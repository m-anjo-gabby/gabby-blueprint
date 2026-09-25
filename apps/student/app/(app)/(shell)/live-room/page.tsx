import { getMyUpcomingSessions, getMyPastSessions, getMyRescheduleProposalGroups, getMyBookingRequests } from '@/actions/sessionAction';
import { getMyBookableTickets, getMyLiveSessionContracts } from '@/actions/matchingAction';
import { LiveSessionHub } from './_components/LiveSessionHub';

export default async function LiveSessionHubPage() {
  const [contracts, upcomingSessions, bookableSlots, pendingProposalGroups, myBookingRequests] = await Promise.all([
    getMyLiveSessionContracts(),
    getMyUpcomingSessions(),
    getMyBookableTickets(),
    getMyRescheduleProposalGroups(),
    getMyBookingRequests(),
  ]);

  // 現在有効な契約を優先し、無ければ直近の過去契約(contractsはstart_date降順)を初期選択とする
  const initialContract = contracts.find((c) => c.is_current) ?? contracts[0] ?? null;
  const initialPastSessions = initialContract ? await getMyPastSessions(initialContract.ticket_id) : [];

  return (
    <LiveSessionHub
      contracts={contracts}
      initialTicketId={initialContract?.ticket_id ?? null}
      upcomingSessions={upcomingSessions}
      initialPastSessions={initialPastSessions}
      bookableSlots={bookableSlots}
      pendingProposalGroups={pendingProposalGroups}
      myBookingRequests={myBookingRequests}
    />
  );
}
