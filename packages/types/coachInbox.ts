import { IncomingMatchingRequestItem, MATCHING_REQUEST_STATUS } from './matching';
import { IncomingRescheduleProposalGroup, SESSION_BOOKING_REQUEST_STATUS, SessionBookingRequest } from './session';

/**
 * ----------------------------------------------
 * コーチ向け「申請一覧」画面の統合受信トレイ型定義
 * ----------------------------------------------
 * コーチの「マッチングリクエスト」画面を、生徒などからの申請を承認する汎用画面に
 * 拡張するための型。現状は下記3種類だが、今後申請の種類が増えた場合もこのUnionに
 * バリアントを追加するだけで一覧に混在表示できるようにする。
 *   - matching: 専属コーチ固定枠への申請(com_t_matching_request)
 *   - booking: 未消化チケットによる自由日時の新規予約リクエスト(com_t_session_booking_request)
 *   - reschedule_proposal: 生徒がキャンセル時に提案した振替候補
 *     (com_t_session_reschedule_proposal, proposed_by_role=1のみ。コーチ発の候補提案は
 *     生徒側で応答するため、この一覧には含めない)
 */

export interface IncomingSessionBookingRequestItem extends SessionBookingRequest {
  student_name: string;
}

export type CoachIncomingRequestItem =
  | { kind: 'matching'; data: IncomingMatchingRequestItem }
  | { kind: 'booking'; data: IncomingSessionBookingRequestItem }
  | { kind: 'reschedule_proposal'; data: IncomingRescheduleProposalGroup };

export type CoachIncomingRequestErrorCode = 'unauthorized' | 'unexpected_error';

export type GetIncomingRequestsForCoachResult =
  | { success: true; requests: CoachIncomingRequestItem[] }
  | { success: false; errorCode: CoachIncomingRequestErrorCode };

/**
 * 種類を問わず「未対応（応答待ち）」かどうかを判定する。reschedule_proposalは
 * pending中のものしか取得しない設計のため常にtrue（getIncomingRescheduleProposalGroupsForCoachCore参照）。
 */
export function isPendingCoachIncomingRequest(item: CoachIncomingRequestItem): boolean {
  switch (item.kind) {
    case 'matching':
      return item.data.status === MATCHING_REQUEST_STATUS.PENDING;
    case 'booking':
      return item.data.status === SESSION_BOOKING_REQUEST_STATUS.PENDING;
    case 'reschedule_proposal':
      return true;
  }
}
