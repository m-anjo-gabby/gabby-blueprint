import { getMyUpcomingSessions, getMyPastSessions, getMyRescheduleProposalGroups, getMyBookingRequests } from '@/actions/sessionAction';
import { getMyBookableTickets, getMyLiveSessionContracts } from '@/actions/matchingAction';
import { LiveSessionHub } from './_components/LiveSessionHub';
import { LiveSessionIntro } from './_components/LiveSessionIntro';

export default async function LiveSessionHubPage() {
  const [contracts, upcomingSessions, bookableSlots, pendingProposalGroups, myBookingRequests] = await Promise.all([
    getMyLiveSessionContracts(),
    getMyUpcomingSessions(),
    getMyBookableTickets(),
    getMyRescheduleProposalGroups(),
    getMyBookingRequests(),
  ]);

  // ライブセッション付き契約を一度も持ったことがない（アプリのみ契約）場合は紹介画面を表示する。
  // 過去に契約があった利用者は、履歴を確認できるようハブを表示する
  if (contracts.length === 0) {
    return <LiveSessionIntro />;
  }

  // 現在有効な契約を優先し、無ければ直近の過去契約(contractsはstart_date降順)を初期選択とする
  const initialContract = contracts.find((c) => c.is_current) ?? contracts[0];
  const initialPastSessions = await getMyPastSessions(initialContract.ticket_id);

  return (
    <LiveSessionHub
      contracts={contracts}
      initialTicketId={initialContract.ticket_id}
      upcomingSessions={upcomingSessions}
      initialPastSessions={initialPastSessions}
      bookableSlots={bookableSlots}
      pendingProposalGroups={pendingProposalGroups}
      myBookingRequests={myBookingRequests}
    />
  );
}
