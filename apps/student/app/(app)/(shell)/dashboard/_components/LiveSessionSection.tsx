import { getMyBookingRequests, getMyProposedRescheduleGroups, getMyRescheduleProposalGroups, getMyUpcomingSessions } from '@/actions/sessionAction';
import { getMyBookableTickets, getMyLiveSessionOverview } from '@/actions/matchingAction';
import { getMyPendingCoachRatings } from '@/actions/coachRatingAction';
import type { LiveSessionContractSummary } from '@gabby/types/matching';
import { getNextContractMatching } from '@/lib/liveSessionContracts';
import { LiveSessionCard, type LiveSessionAction } from './LiveSessionCard';

/**
 * ホームのライブセッションの区画（サーバーで取得し、ページ側の Suspense で遅れて表示する）。
 * 対応が必要なことの判定は、ライブセッション管理（LiveSessionHub）の「対応が必要です」と同じ条件にする。
 * contracts はライブセッション契約の一覧（現在の契約と並ぶ次の契約の判定に使う）。
 */
export async function LiveSessionSection({ contract, contracts }: { contract: LiveSessionContractSummary; contracts: LiveSessionContractSummary[] }) {
  const isCurrent = contract.is_current;
  const [upcomingSessions, overview, bookableSlots, proposalGroups, proposedGroups, bookingRequests, nextMatching, pendingRatings] = await Promise.all([
    getMyUpcomingSessions(1),
    getMyLiveSessionOverview(contract.ticket_id),
    getMyBookableTickets(),
    getMyRescheduleProposalGroups(),
    getMyProposedRescheduleGroups(),
    getMyBookingRequests(),
    isCurrent ? getNextContractMatching(contracts) : Promise.resolve(null),
    getMyPendingCoachRatings(),
  ]);

  const adjustingCount = isCurrent ? bookingRequests.length + proposalGroups.length + proposedGroups.length : 0;
  const actions: LiveSessionAction[] = [];
  // 専属コーチの未選択は、表示中の契約（現在の契約、または開始前の契約だけを持つ場合はその契約）を案内する
  const unmatchedSlotCount = overview?.slots.filter((s) => s.status === 'unmatched').length ?? 0;
  if (isCurrent && proposalGroups.length > 0) {
    actions.push({ key: 'proposal', label: `振替日時の候補が届いています（${proposalGroups.length}件）`, href: '/live-room' });
  }
  if (overview && unmatchedSlotCount > 0) {
    actions.push({
      key: 'unmatched',
      label: overview.weekly_frequency > 1 ? `${unmatchedSlotCount}コマの専属コーチが未選択です` : '専属コーチが未選択です',
      href: `/coach-matching?contract=${contract.ticket_id}`,
    });
  } else if (nextMatching && nextMatching.unmatchedCount > 0) {
    // 現在の契約の選択が済んでいれば、次の契約（継続用）の選択を促す
    actions.push({
      key: 'next-unmatched',
      label: nextMatching.slotCount > 1 ? `次の契約で${nextMatching.unmatchedCount}コマの専属コーチが未選択です` : '次の契約の専属コーチが未選択です',
      href: `/coach-matching?contract=${nextMatching.contract.ticket_id}`,
    });
  }
  if (isCurrent) {
    const unbookedCount = overview ? Math.max(overview.unbooked_count - adjustingCount, 0) : 0;
    if (unbookedCount > 0 && bookableSlots.length > 0) {
      actions.push({ key: 'unbooked', label: `日時が決まっていないセッションが${unbookedCount}回あります`, href: '/live-room' });
    }
  }
  const ratingCount = pendingRatings.filter((r) => r.ticketId === contract.ticket_id).length;
  if (ratingCount > 0) {
    actions.push({ key: 'rating', label: `専属コーチの評価をお願いします（${ratingCount}件）`, href: `/live-room?contract=${contract.ticket_id}` });
  }
  // 専属コーチの申請の回答待ち（生徒の対応ではないため最後に、注意の見た目にせず出す）。
  // ライブセッション管理の「契約の状況」のコマの一覧から、申請の確認・取り下げができる
  const pendingSlotCount = overview?.slots.filter((s) => s.status === 'pending').length ?? 0;
  if (pendingSlotCount > 0) {
    actions.push({
      key: 'pending',
      label: `専属コーチの回答待ちのリクエストが${pendingSlotCount}件あります`,
      href: `/live-room?contract=${contract.ticket_id}`,
      tone: 'waiting',
    });
  }
  if (nextMatching && nextMatching.pendingCount > 0) {
    actions.push({
      key: 'next-pending',
      label: `次の契約で専属コーチの回答待ちのリクエストが${nextMatching.pendingCount}件あります`,
      href: `/live-room?contract=${nextMatching.contract.ticket_id}`,
      tone: 'waiting',
    });
  }

  return (
    <LiveSessionCard
      nextSession={upcomingSessions[0] ?? null}
      overview={overview}
      isCurrent={isCurrent}
      adjustingCount={adjustingCount}
      actions={actions}
    />
  );
}
