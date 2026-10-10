'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';

const logger = createLogger('admin');

/** com_t_coach_rating.source（1:生徒アプリ 2:移行元システム 3:新人コーチの初期値） */
export type CoachRatingSource = 1 | 2 | 3;

export interface AdminCoachRatingRow {
  ratingId: string;
  source: CoachRatingSource;
  ratedAt: string;
  coaching: number;
  friendliness: number;
  recommendation: number;
  /** 運営へのコメント（コーチには非公開） */
  feedback: string | null;
  /** 評価した生徒（移行データ・初期値は null） */
  student: { id: string; name: string | null; email: string | null } | null;
  planName: string | null;
  licenseStart: string | null;
  licenseEnd: string | null;
}

export interface AdminCoachRatingStats {
  count: number;
  overall: number;
  coaching: number;
  friendliness: number;
  recommendation: number;
}

export interface AdminCoachRatings {
  coach: { id: string; name: string | null; email: string | null };
  /** 評価0件は null */
  stats: AdminCoachRatingStats | null;
  ratings: AdminCoachRatingRow[];
}

type RpcResult = {
  coach: { id: string; name: string | null; email: string | null };
  stats: Record<keyof AdminCoachRatingStats, number | string> | null;
  ratings: {
    rating_id: string;
    source: CoachRatingSource;
    rated_at: string;
    coaching: number | string;
    friendliness: number | string;
    recommendation: number | string;
    feedback: string | null;
    student: { id: string; name: string | null; email: string | null } | null;
    plan_name: string | null;
    license_start: string | null;
    license_end: string | null;
  }[];
};

/**
 * コーチの評価（集計・評価の行・運営へのコメント）を取得する（admin_get_coach_ratings。アドミン以外はDB側で拒否）。
 * コーチが見つからない場合は null。
 */
export async function getCoachRatings(coachId: string): Promise<AdminCoachRatings | null> {
  const ctx = await getLogContext();
  try {
    // RPC がアドミンかどうかを JWT で判定するため、service_role ではなくログイン中のクライアントで呼ぶ
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('admin_get_coach_ratings', { p_coach_id: coachId });
    if (error) {
      logger.error('coach_rating:admin_get_failed', error.message, { ...ctx, err: error, payload: { coachId } });
      return null;
    }
    if (!data) return null;

    const result = data as RpcResult;
    return {
      coach: result.coach,
      stats: result.stats
        ? {
            count: Number(result.stats.count),
            overall: Number(result.stats.overall),
            coaching: Number(result.stats.coaching),
            friendliness: Number(result.stats.friendliness),
            recommendation: Number(result.stats.recommendation),
          }
        : null,
      ratings: result.ratings.map((r) => ({
        ratingId: r.rating_id,
        source: r.source,
        ratedAt: r.rated_at,
        coaching: Number(r.coaching),
        friendliness: Number(r.friendliness),
        recommendation: Number(r.recommendation),
        feedback: r.feedback,
        student: r.student,
        planName: r.plan_name,
        licenseStart: r.license_start,
        licenseEnd: r.license_end,
      })),
    };
  } catch (err) {
    logger.error('coach_rating:admin_get_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return null;
  }
}
