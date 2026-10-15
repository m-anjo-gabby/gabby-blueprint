'use server';

import { z } from 'zod';
import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import {
  COACH_RATING_FEEDBACK_MAX_LENGTH,
  COACH_RATING_MAX,
  COACH_RATING_MIN,
  CoachRatingStats,
  PendingCoachRating,
  SubmitCoachRatingInput,
  SubmitCoachRatingResult,
} from '@gabby/types/coachRating';

const logger = createLogger('common');

type CoachStatsRow = {
  coach_id: string;
  rating_count: number;
  rating_overall_avg: number | string | null;
  rating_coaching_avg: number | string | null;
  rating_friendliness_avg: number | string | null;
};

// numeric 列は PostgREST から文字列で返ることがあるため数値にそろえる
const toNumberOrNull = (value: number | string | null): number | null => (value === null ? null : Number(value));

/**
 * 指定したコーチの評価の集計を取得する（ポータル共通。集計は com_t_coach_stats をログイン済みなら誰でも参照できる）。
 * 評価がまだ無いコーチは結果に含まれない（呼び出し側で「評価なし」として扱う）。
 */
export async function getCoachRatingStatsCore(coachIds: string[]): Promise<Map<string, CoachRatingStats>> {
  const statsById = new Map<string, CoachRatingStats>();
  if (coachIds.length === 0) return statsById;

  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('com_t_coach_stats')
      .select('coach_id, rating_count, rating_overall_avg, rating_coaching_avg, rating_friendliness_avg')
      .in('coach_id', coachIds)
      .gt('rating_count', 0);

    if (error) {
      logger.error('coach_rating:get_stats_failed', error.message, { ...ctx, err: error });
      return statsById;
    }
    for (const row of (data ?? []) as CoachStatsRow[]) {
      statsById.set(row.coach_id, {
        coachId: row.coach_id,
        ratingCount: row.rating_count,
        overallAvg: toNumberOrNull(row.rating_overall_avg),
        coachingAvg: toNumberOrNull(row.rating_coaching_avg),
        friendlinessAvg: toNumberOrNull(row.rating_friendliness_avg),
      });
    }
    return statsById;
  } catch (err) {
    logger.error('coach_rating:get_stats_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return statsById;
  }
}

type PendingCoachRatingRow = {
  ticket_id: string;
  coach_id: string;
  coach_name: string | null;
  coach_icon_path: string | null;
  plan_name: string | null;
  license_end_date: string;
  completed_count: number;
};

/**
 * ログイン中の生徒が評価を待っている「契約×コーチ」の一覧を取得する（対象の判定は fn_coach_rating_targets）。
 */
export async function getMyPendingCoachRatingsCore(): Promise<PendingCoachRating[]> {
  const ctx = await getLogContext();
  try {
    const user = await getAuthUser();
    if (!user) return [];

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('get_my_pending_coach_ratings');
    if (error) {
      logger.error('coach_rating:get_pending_failed', error.message, { ...ctx, err: error, userId: user.id });
      return [];
    }
    return ((data ?? []) as PendingCoachRatingRow[]).map((row) => ({
      ticketId: row.ticket_id,
      coachId: row.coach_id,
      coachName: row.coach_name ?? '',
      coachIconPath: row.coach_icon_path,
      planName: row.plan_name ?? '',
      licenseEndDate: row.license_end_date,
      completedCount: row.completed_count,
    }));
  } catch (err) {
    logger.error('coach_rating:get_pending_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return [];
  }
}

const scoreSchema = z.number().int().min(COACH_RATING_MIN).max(COACH_RATING_MAX);
const submitSchema = z.object({
  ticketId: z.uuid(),
  coachId: z.uuid(),
  scores: z.object({ coaching: scoreSchema, friendliness: scoreSchema, recommendation: scoreSchema }),
  feedback: z.string().trim().max(COACH_RATING_FEEDBACK_MAX_LENGTH),
});

/**
 * 生徒がコーチを評価する（submit_coach_rating。対象であることの確認・二重登録の防止は RPC 側で行う）。
 */
export async function submitCoachRatingCore(input: SubmitCoachRatingInput): Promise<SubmitCoachRatingResult> {
  const ctx = await getLogContext();
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const parsed = submitSchema.safeParse(input);
    if (!parsed.success) return { success: false, errorCode: 'invalid_input' };
    const { ticketId, coachId, scores, feedback } = parsed.data;

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('submit_coach_rating', {
      p_ticket_id: ticketId,
      p_coach_id: coachId,
      p_coaching_score: scores.coaching,
      p_friendliness_score: scores.friendliness,
      p_recommendation_score: scores.recommendation,
      p_feedback: feedback,
    });

    if (error) {
      if (error.message?.includes('ALREADY_RATED')) return { success: false, errorCode: 'already_rated' };
      if (error.message?.includes('NOT_ELIGIBLE')) return { success: false, errorCode: 'not_eligible' };
      if (error.message?.includes('INVALID_SCORE') || error.message?.includes('FEEDBACK_TOO_LONG')) {
        return { success: false, errorCode: 'invalid_input' };
      }
      logger.error('coach_rating:submit_failed', error.message, { ...ctx, err: error, userId: user.id, payload: { ticketId, coachId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    logger.info('coach_rating:submit_success', 'Coach rating submitted', { ...ctx, userId: user.id, payload: { ticketId, coachId } });
    return { success: true };
  } catch (err) {
    logger.error('coach_rating:submit_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/** ログイン中のコーチ自身の評価の集計を取得する（評価がまだ無い場合は null） */
export async function getMyCoachRatingStatsCore(): Promise<CoachRatingStats | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const statsById = await getCoachRatingStatsCore([user.id]);
  return statsById.get(user.id) ?? null;
}
