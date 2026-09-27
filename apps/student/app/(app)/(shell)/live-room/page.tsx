import { getMyUpcomingSessions, getMyPastSessions, getMyRescheduleProposalGroups, getMyBookingRequests } from '@/actions/sessionAction';
import { getMyBookableTickets, getMyLiveSessionContracts, getMyLiveSessionOverview } from '@/actions/matchingAction';
import type { SessionListItem } from '@gabby/types/session';
import type { LiveSessionOverview } from '@gabby/types/matching';
import { LiveSessionHub } from './_components/LiveSessionHub';
import { LiveSessionIntro } from './_components/LiveSessionIntro';

// URLで指定された契約を優先し、無ければ現在有効な契約、それも無ければ直近の過去契約(contractsはstart_date降順)を選ぶ
function pickContract<T extends { ticket_id: string; is_current: boolean }>(contracts: T[], requestedTicketId?: string): T | undefined {
  return contracts.find((c) => c.ticket_id === requestedTicketId) ?? contracts.find((c) => c.is_current) ?? contracts[0];
}

export default async function LiveSessionHubPage({ searchParams }: { searchParams: Promise<{ contract?: string }> }) {
  const { contract: requestedTicketId } = await searchParams;

  // 契約単位のデータ（履歴・回数の内訳）は選択中の契約に依存するため、契約一覧の取得直後に開始し、他の取得と並行させる
  const contractsPromise = getMyLiveSessionContracts();
  const contractDataPromise = contractsPromise.then(async (contracts): Promise<[SessionListItem[], LiveSessionOverview | null]> => {
    const selected = pickContract(contracts, requestedTicketId);
    if (!selected) return [[], null];
    return Promise.all([getMyPastSessions(selected.ticket_id), getMyLiveSessionOverview(selected.ticket_id)]);
  });

  const [contracts, [pastSessions, overview], upcomingSessions, bookableSlots, proposalGroups, bookingRequests] = await Promise.all([
    contractsPromise,
    contractDataPromise,
    getMyUpcomingSessions(),
    getMyBookableTickets(),
    getMyRescheduleProposalGroups(),
    getMyBookingRequests(),
  ]);

  // ライブセッション付き契約を一度も持ったことがない（アプリのみ契約）場合は紹介画面を表示する。
  // 過去に契約があった利用者は、履歴を確認できるようハブを表示する
  const selectedContract = pickContract(contracts, requestedTicketId);
  if (!selectedContract) {
    return <LiveSessionIntro />;
  }

  return (
    <LiveSessionHub
      contracts={contracts}
      selectedContract={selectedContract}
      overview={overview}
      upcomingSessions={upcomingSessions}
      pastSessions={pastSessions}
      bookableSlots={bookableSlots}
      proposalGroups={proposalGroups}
      bookingRequests={bookingRequests}
    />
  );
}
