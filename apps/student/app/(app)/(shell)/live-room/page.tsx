import { getMyUpcomingSessions, getMyPastSessions, getMyRescheduleProposalGroups, getMyBookingRequests } from '@/actions/sessionAction';
import { getMyBookableTickets, getMyLiveSessionContracts } from '@/actions/matchingAction';
import { LiveSessionHub } from './_components/LiveSessionHub';
import { LiveSessionIntro } from './_components/LiveSessionIntro';

// 現在有効な契約を優先し、無ければ直近の過去契約(contractsはstart_date降順)を初期選択とする
function pickInitialContract<T extends { is_current: boolean }>(contracts: T[]): T | undefined {
  return contracts.find((c) => c.is_current) ?? contracts[0];
}

export default async function LiveSessionHubPage() {
  // 過去セッションは初期選択の契約に依存するため、契約一覧の取得直後に開始し、他の取得と並行させる
  const contractsPromise = getMyLiveSessionContracts();
  const pastSessionsPromise = contractsPromise.then((contracts) => {
    const initialContract = pickInitialContract(contracts);
    return initialContract ? getMyPastSessions(initialContract.ticket_id) : [];
  });

  const [contracts, initialPastSessions, upcomingSessions, bookableSlots, pendingProposalGroups, myBookingRequests] = await Promise.all([
    contractsPromise,
    pastSessionsPromise,
    getMyUpcomingSessions(),
    getMyBookableTickets(),
    getMyRescheduleProposalGroups(),
    getMyBookingRequests(),
  ]);

  // ライブセッション付き契約を一度も持ったことがない（アプリのみ契約）場合は紹介画面を表示する。
  // 過去に契約があった利用者は、履歴を確認できるようハブを表示する
  const initialContract = pickInitialContract(contracts);
  if (!initialContract) {
    return <LiveSessionIntro />;
  }

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
