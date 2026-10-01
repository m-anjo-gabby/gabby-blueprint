import { getMyBookingRequests, getMyRescheduleProposalGroups, getMyUpcomingSessions } from '@/actions/sessionAction';
import { getMyBookableTickets, getMyLiveSessionOverview } from '@/actions/matchingAction';
import type { LiveSessionContractSummary } from '@gabby/types/matching';
import { LiveSessionCard, type LiveSessionAction } from './LiveSessionCard';

/**
 * ホームのライブセッションの区画（サーバーで取得し、ページ側の Suspense で遅れて表示する）。
 * 対応が必要なことの判定は、ライブセッション管理（LiveSessionHub）の「対応が必要です」と同じ条件にする。
 */
export async function LiveSessionSection({ contract }: { contract: LiveSessionContractSummary }) {
  const [upcomingSessions, overview, bookableSlots, proposalGroups, bookingRequests] = await Promise.all([
    getMyUpcomingSessions(1),
    getMyLiveSessionOverview(contract.ticket_id),
    getMyBookableTickets(),
    getMyRescheduleProposalGroups(),
    getMyBookingRequests(),
  ]);

  const isCurrent = contract.is_current;
  const adjustingCount = isCurrent ? bookingRequests.length + proposalGroups.length : 0;
  const actions: LiveSessionAction[] = [];
  if (isCurrent) {
    if (proposalGroups.length > 0) {
      actions.push({ key: 'proposal', label: `振替日時の候補が届いています（${proposalGroups.length}件）`, href: '/live-room' });
    }
    const unmatchedSlotCount = overview?.slots.filter((s) => s.status === 'unmatched').length ?? 0;
    if (overview && unmatchedSlotCount > 0) {
      actions.push({
        key: 'unmatched',
        label: overview.weekly_frequency > 1 ? `${unmatchedSlotCount}コマの専属コーチが未選択です` : '専属コーチが未選択です',
        href: '/coach-matching',
      });
    }
    const unbookedCount = overview ? Math.max(overview.unbooked_count - adjustingCount, 0) : 0;
    if (unbookedCount > 0 && bookableSlots.length > 0) {
      actions.push({ key: 'unbooked', label: `日時が決まっていないセッションが${unbookedCount}回あります`, href: '/live-room' });
    }
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
