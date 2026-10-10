'use server';

import { getMyPendingCoachRatingsCore, submitCoachRatingCore } from '@gabby/lib/coachRating/actions/coachRatingActions';
import type { CoachRatingErrorCode, PendingCoachRating, SubmitCoachRatingInput } from '@gabby/types/coachRating';

const COACH_RATING_ERROR_MESSAGES_JA: Record<CoachRatingErrorCode, string> = {
  unauthorized: 'セッションの有効期限が切れました。再度ログインしてください。',
  invalid_input: 'すべての項目を星1〜5で選んでください。',
  already_rated: 'このコーチは評価済みです。',
  not_eligible: 'このコーチの評価の受付期間は終了しました。',
  unexpected_error: '評価を送信できませんでした。時間をおいてもう一度お試しください。',
};

/** 評価を待っているコーチ（契約×コーチ）の一覧を取得する */
export async function getMyPendingCoachRatings(): Promise<PendingCoachRating[]> {
  return getMyPendingCoachRatingsCore();
}

/** コーチを評価する */
export async function submitCoachRating(
  input: SubmitCoachRatingInput
): Promise<{ success: true } | { success: false; message: string }> {
  const result = await submitCoachRatingCore(input);
  if (!result.success) return { success: false, message: COACH_RATING_ERROR_MESSAGES_JA[result.errorCode] };
  return { success: true };
}
