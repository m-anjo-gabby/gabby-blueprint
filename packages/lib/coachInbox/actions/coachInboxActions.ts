'use server';

import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { getPendingIncomingRequestsAsCoachCore } from '../../matching/actions/matchingActions';
import {
  getPendingIncomingBookingRequestsForCoachCore,
  getPendingIncomingRescheduleProposalGroupsForCoachCore,
} from '../../session/actions/sessionActions';
import { CoachIncomingRequestErrorCode, CoachIncomingRequestItem, GetIncomingRequestsForCoachResult } from '@gabby/types/coachInbox';

const logger = createLogger('common');

/**
 * コーチ宛の未対応(pending)申請を、種類を問わず1つの一覧として取得する。
 * Pending Requestsパネル・サイドバーの件数バッジ等、ページ表示のたびに参照される
 * 軽量な用途向け（各テーブルのstatus=pendingのみを取得するため、コーチの稼働年数が
 * 伸びても件数は増え続けない）。統合された全履歴（Pending+History）が必要な場合は
 * 各申請一覧画面がgetMatchingRequestHistoryPageAsCoachCore等の個別ページングAPIを使うこと。
 *   - matching: 専属コーチ固定枠への申請 (com_t_matching_request)
 *   - booking: 未消化チケットによる自由日時の新規予約リクエスト (com_t_session_slot_proposal、source_session_id IS NULL)
 *   - reschedule_proposal: 生徒がキャンセル時に提案した振替候補 (proposed_by_role=STUDENTのみ)
 */
export async function getPendingIncomingRequestsForCoachCore(): Promise<GetIncomingRequestsForCoachResult> {
  const ctx = await getLogContext();

  try {
    const [matchingResult, bookingResult, proposalResult] = await Promise.all([
      getPendingIncomingRequestsAsCoachCore(),
      getPendingIncomingBookingRequestsForCoachCore(),
      getPendingIncomingRescheduleProposalGroupsForCoachCore(),
    ]);

    if (!matchingResult.success) return { success: false, errorCode: matchingResult.errorCode as CoachIncomingRequestErrorCode };
    if (!bookingResult.success) return { success: false, errorCode: bookingResult.errorCode as CoachIncomingRequestErrorCode };
    if (!proposalResult.success) return { success: false, errorCode: proposalResult.errorCode as CoachIncomingRequestErrorCode };

    const items: CoachIncomingRequestItem[] = [
      ...matchingResult.requests.map((data): CoachIncomingRequestItem => ({ kind: 'matching', data })),
      ...bookingResult.requests.map((data): CoachIncomingRequestItem => ({ kind: 'booking', data })),
      ...proposalResult.groups.map((data): CoachIncomingRequestItem => ({ kind: 'reschedule_proposal', data })),
    ];

    items.sort((a, b) => b.data.insert_date.localeCompare(a.data.insert_date));

    return { success: true, requests: items };
  } catch (err) {
    logger.error('coachInbox:get_pending_incoming_requests_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
