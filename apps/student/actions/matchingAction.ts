'use server';

import {
  getMyLiveSessionTicketsCore,
  getMySlotStatusCore,
  getCoachBrowseListCore,
  getMyBookableTicketsCore,
  createMatchingRequestCore,
  cancelMatchingRequestCore,
} from '@gabby/lib/matching/actions/matchingActions';
import { getCountryListCore } from '@gabby/lib/country/actions/countryActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  BookableTicketSlot,
  CoachBrowseItem,
  CreateMatchingRequestInput,
  LiveSessionTicketSummary,
  MatchingRequestErrorCode,
  SlotStatusItem,
} from '@gabby/types/matching';
import { CountryMaster } from '@gabby/types/country';

const logger = createLogger('student');

const MATCHING_ERROR_MESSAGES_JA: Record<MatchingRequestErrorCode, string> = {
  unauthorized: 'セッションの有効期限が切れました。再度ログインしてください。',
  invalid_input: '入力内容をご確認ください（希望時間がコーチの対応可能時間内に収まっているかご確認ください）。',
  not_eligible: 'この操作を行う権限がありません。',
  slot_already_requested: 'この枠は既にマッチング済み、または承認待ちのリクエストがあります。',
  schedule_conflict: 'この時間帯はコーチの既存の予約と重複しています。別の時間帯をお選びください。',
  db_insert_failed: 'リクエストの送信に失敗しました。',
  db_update_failed: '更新に失敗しました。既にコーチが対応済みの可能性があります。',
  unexpected_error: '予期しないエラーが発生しました。',
};

/**
 * ログイン中の生徒が保有する、現在有効なライブセッションチケットの一覧を取得
 */
export async function getMyLiveSessionTickets(): Promise<LiveSessionTicketSummary[]> {
  const result = await getMyLiveSessionTicketsCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_my_tickets_failed', result.errorCode, ctx);
    return [];
  }
  return result.tickets;
}

/**
 * 指定チケットの、週n回分の各枠のマッチング状況を取得
 */
export async function getMySlotStatus(ticketId: string): Promise<SlotStatusItem[]> {
  const result = await getMySlotStatusCore(ticketId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_slot_status_failed', result.errorCode, ctx);
    return [];
  }
  return result.slots;
}

/**
 * マッチング可能なコーチの一覧を取得
 */
export async function getCoachBrowseList(): Promise<CoachBrowseItem[]> {
  const result = await getCoachBrowseListCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_coach_list_failed', result.errorCode, ctx);
    return [];
  }
  return result.coaches;
}

/**
 * コーチプロフィールプレビュー（国籍表示）用の国マスタ一覧を取得
 */
export async function getCountryList(): Promise<CountryMaster[]> {
  const result = await getCountryListCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_country_list_failed', result.errorCode, ctx);
    return [];
  }
  return result.countries;
}

/**
 * 未割当チケット(キャンセル等でticket_refunded=trueとなった枠)により再予約可能な
 * 定期スケジュール(コマ)の一覧を取得する
 */
export async function getMyBookableTickets(): Promise<BookableTicketSlot[]> {
  const result = await getMyBookableTicketsCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('student:get_my_bookable_tickets_failed', result.errorCode, ctx);
    return [];
  }
  return result.slots;
}

/**
 * マッチングリクエストを送信する
 */
export async function createMatchingRequest(
  input: CreateMatchingRequestInput
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await createMatchingRequestCore(input);

  if (!result.success) {
    logger.error('student:create_matching_request_failed', result.errorCode, ctx);
    return { success: false, message: MATCHING_ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:create_matching_request_success', 'Matching request created', ctx);
  return { success: true };
}

/**
 * 承認待ちの自分のマッチングリクエストを取消す
 */
export async function cancelMatchingRequest(
  requestId: string
): Promise<{ success: true } | { success: false; message: string }> {
  const ctx = await getLogContext();
  const result = await cancelMatchingRequestCore(requestId);

  if (!result.success) {
    logger.error('student:cancel_matching_request_failed', result.errorCode, ctx);
    return { success: false, message: MATCHING_ERROR_MESSAGES_JA[result.errorCode] };
  }

  logger.info('student:cancel_matching_request_success', 'Matching request cancelled', ctx);
  return { success: true };
}
