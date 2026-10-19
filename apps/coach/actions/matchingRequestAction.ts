'use server';

import {
  approveMatchingRequestCore,
  rejectMatchingRequestCore,
  getMatchingRequestHistoryPageAsCoachCore,
} from '@gabby/lib/matching/actions/matchingActions';
import { getPendingIncomingRequestsForCoachCore } from '@gabby/lib/coachInbox/actions/coachInboxActions';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { type IncomingMatchingRequestItem, type MatchingRequestErrorCode } from '@gabby/types/matching';
import { type CoachIncomingRequestItem } from '@gabby/types/coachInbox';
import type { ActionResult } from '@gabby/types/action';

const logger = createLogger('coach');

const MATCHING_ERROR_MESSAGES_EN: Record<MatchingRequestErrorCode, string> = {
  unauthorized: 'Your session has expired. Please sign in again.',
  invalid_input: 'Please check the values you entered.',
  not_eligible: 'This request is no longer valid.',
  slot_already_requested: 'This slot has already been matched or has a pending request.',
  schedule_conflict:
    'This request overlaps with one of your existing schedules. Please reject it and coordinate an alternative time with the student individually.',
  insufficient_bookable:
    'Too many lessons in this slot now clash with your other bookings or days off, so it can no longer be approved. Please reject it with a reason so the student can choose another time.',
  not_pending: 'This request is no longer pending. The student may have withdrawn it.',
  expired: 'This request has expired because it was not answered within 24 hours. The student can send a new request.',
  db_insert_failed: 'Failed to save the request.',
  db_update_failed: 'Failed to update the request. It may have already been responded to.',
  unexpected_error: 'An unexpected error occurred.',
};

/**
 * ログイン中のコーチ宛ての「保留中」の依頼をすべて取得する。固定枠のマッチングの依頼・
 * 空き時間へのセッションの予約の依頼・生徒がキャンセルの時に出した振替の候補を、
 * 1つの一覧にまとめる。状態で絞った軽い取得で、毎回の表示で出す場所（カレンダーの保留の一覧・
 * サイドバーのバッジ・ダッシュボード）向け。
 * 依頼の履歴の全体は、
 * getMatchingRequestHistoryPage / getBookingRequestHistoryPage / getRescheduleProposalHistoryPage を使う。
 */
export async function getPendingIncomingRequestsForCoach(): Promise<CoachIncomingRequestItem[]> {
  const result = await getPendingIncomingRequestsForCoachCore();
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_pending_incoming_requests_failed', result.errorCode, ctx);
    return [];
  }
  return result.requests;
}

/**
 * コーチのマッチングの依頼の履歴を、新しい順に1ページ分取得する。
 * 次のページは前のページの `nextCursor` を渡して取得する。結果の `nextCursor` が null なら、
 * それより古い履歴は無い。
 */
export async function getMatchingRequestHistoryPage(
  cursor: string | null,
  limit: number,
): Promise<{ items: IncomingMatchingRequestItem[]; nextCursor: string | null }> {
  const result = await getMatchingRequestHistoryPageAsCoachCore(cursor, limit);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('coach:get_matching_request_history_page_failed', result.errorCode, ctx);
    return { items: [], nextCursor: null };
  }
  return { items: result.items, nextCursor: result.nextCursor };
}

/**
 * マッチングの依頼を承認する。毎週のレッスンの予定を作り、
 * ライセンスの期間のセッションをすべて作る。
 */
export async function approveMatchingRequest(requestId: string): Promise<ActionResult> {
  const ctx = await getLogContext();
  const result = await approveMatchingRequestCore(requestId);

  if (!result.success) {
    logger.error('coach:approve_matching_request_failed', result.errorCode, ctx);
    return { success: false, message: MATCHING_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:approve_matching_request_success', 'Matching request approved', ctx);
  return { success: true };
}

/**
 * マッチングの依頼を断る（理由は必須）
 */
export async function rejectMatchingRequest(requestId: string, reason: string): Promise<ActionResult> {
  const ctx = await getLogContext();
  const result = await rejectMatchingRequestCore(requestId, reason);

  if (!result.success) {
    logger.error('coach:reject_matching_request_failed', result.errorCode, ctx);
    return { success: false, message: MATCHING_ERROR_MESSAGES_EN[result.errorCode] };
  }

  logger.info('coach:reject_matching_request_success', 'Matching request rejected', ctx);
  return { success: true };
}
