import { UserX } from 'lucide-react';
import { getMyLiveSessionTickets, getMySlotStatus, getCoachBrowseList, getCountryList } from '@/actions/matchingAction';
import { getMyLiveSessionContractsCached, pickLiveSessionContract } from '@/lib/liveSessionContracts';
import { CoachMatchingView } from './_components/CoachMatchingView';
import { CoachMatchingPageHeader } from './_components/CoachMatchingSkeleton';

export default async function CoachMatchingPage({ searchParams }: { searchParams: Promise<{ contract?: string }> }) {
  const { contract: requestedTicketId } = await searchParams;

  // マッチングは契約（チケット）ごと。申請できるのは有効な契約（終了日前。開始前の次の契約を含む）で、
  // 現在の契約と次の契約を両方持つ場合は切り替えて申請する（既定は現在の契約）
  // 枠の状況は選んだ契約に依存するため、契約の取得直後に開始し、コーチ一覧等の取得と並行させる
  const selectionPromise = Promise.all([getMyLiveSessionContractsCached(), getMyLiveSessionTickets()]).then(([contracts, tickets]) => {
    const activeContracts = contracts.filter((c) => c.is_active);
    const selected = pickLiveSessionContract(activeContracts, requestedTicketId);
    const ticket = selected ? tickets.find((t) => t.ticket_id === selected.ticket_id) : undefined;
    return { activeContracts, ticket };
  });
  const slotsPromise = selectionPromise.then(({ ticket }) => (ticket ? getMySlotStatus(ticket.ticket_id) : []));

  const [{ activeContracts, ticket }, slots, coaches, countries] = await Promise.all([
    selectionPromise,
    slotsPromise,
    getCoachBrowseList(),
    getCountryList(),
  ]);

  if (!ticket) {
    return (
      <>
        <CoachMatchingPageHeader />
        <div className="flex flex-col items-center justify-center rounded-card border border-line bg-surface py-16 text-center px-6">
          <div className="w-14 h-14 rounded-control bg-canvas flex items-center justify-center text-ink-subtle mb-4">
            <UserX size={22} />
          </div>
          <p className="text-sm font-semibold text-ink-soft">この機能はライブセッション付きプランの方のみご利用いただけます</p>
          <p className="text-xs text-ink-muted mt-1.5">ご不明な点はサポートまでお問い合わせください</p>
        </div>
      </>
    );
  }

  return (
    <CoachMatchingView
      // 契約を切り替えたら枠の状態・絞り込みを引き継がない
      key={ticket.ticket_id}
      ticket={ticket}
      contracts={activeContracts}
      initialSlots={slots}
      coaches={coaches}
      countries={countries}
    />
  );
}
