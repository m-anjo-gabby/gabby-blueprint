'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { getIncomingRequestsAsCoachCore } from '../../matching/actions/matchingActions';
import {
  getIncomingBookingRequestsForCoachCore,
  getIncomingRescheduleProposalGroupsForCoachCore,
} from '../../session/actions/sessionActions';
import { CoachIncomingRequestErrorCode, CoachIncomingRequestItem, GetIncomingRequestsForCoachResult } from '@gabby/types/coachInbox';

const logger = createLogger('common');

/**
 * コーチ宛の受信申請を、種類を問わず1つの一覧として取得する（申請一覧画面用）。
 * 現状は下記3種類を統合する。
 *   - matching: 専属コーチ固定枠への申請 (com_t_matching_request)
 *   - booking: 未消化チケットによる自由日時の新規予約リクエスト (com_t_session_booking_request)
 *   - reschedule_proposal: 生徒がキャンセル時に提案した振替候補 (proposed_by_role=STUDENTのみ)
 * insert_date降順でソートし、呼び出し側(画面)でstatus別のPending/History振り分けを行う
 * （既存のマッチングリクエスト一覧と同じ責務分担）。
 */
export async function getIncomingRequestsForCoachCore(): Promise<GetIncomingRequestsForCoachResult> {
  const ctx = await getLogContext();

  try {
    const [matchingResult, bookingResult, proposalResult] = await Promise.all([
      getIncomingRequestsAsCoachCore(),
      getIncomingBookingRequestsForCoachCore(),
      getIncomingRescheduleProposalGroupsForCoachCore(),
    ]);

    if (!matchingResult.success) return { success: false, errorCode: matchingResult.errorCode as CoachIncomingRequestErrorCode };
    if (!bookingResult.success) return { success: false, errorCode: bookingResult.errorCode as CoachIncomingRequestErrorCode };
    if (!proposalResult.success) return { success: false, errorCode: proposalResult.errorCode as CoachIncomingRequestErrorCode };

    const bookingNameById = new Map<string, string>();
    // getIncomingBookingRequestsForCoachCore は student_name を結合しないため、ここで解決する
    const items: CoachIncomingRequestItem[] = [
      ...matchingResult.requests.map((data): CoachIncomingRequestItem => ({ kind: 'matching', data })),
      ...proposalResult.groups.map((data): CoachIncomingRequestItem => ({ kind: 'reschedule_proposal', data })),
    ];

    if (bookingResult.requests.length > 0) {
      const supabase = await createServerClient();
      const studentIds = Array.from(new Set(bookingResult.requests.map((r) => r.student_id)));
      const { data: students } = await supabase.from('com_m_user').select('id, user_name').in('id', studentIds);
      for (const s of students ?? []) bookingNameById.set(s.id, s.user_name ?? '(Unknown)');

      for (const request of bookingResult.requests) {
        items.push({
          kind: 'booking',
          data: { ...request, student_name: bookingNameById.get(request.student_id) ?? '(Unknown)' },
        });
      }
    }

    items.sort((a, b) => b.data.insert_date.localeCompare(a.data.insert_date));

    return { success: true, requests: items };
  } catch (err) {
    logger.error('coachInbox:get_incoming_requests_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
