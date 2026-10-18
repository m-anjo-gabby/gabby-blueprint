'use server';

import { unstable_rethrow } from 'next/navigation';

import { requireAdminRole, SYSTEM_ADMIN_ONLY } from '@/lib/adminAuth';
import { createServerClient } from '@gabby/lib/supabase/server';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import type { CoachRatingSource } from '@gabby/types/coachRating';

const logger = createLogger('admin');

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

/**
 * コーチの評価（集計・評価の行・運営へのコメント）を取得する（admin_get_coach_ratings。アドミン以外はDB側で拒否）。
 * コーチが見つからない場合は null。
 */
export async function getCoachRatings(coachId: string): Promise<AdminCoachRatings | null> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
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

    return {
      coach: data.coach,
      stats: data.stats
        ? {
            count: Number(data.stats.count),
            overall: Number(data.stats.overall),
            coaching: Number(data.stats.coaching),
            friendliness: Number(data.stats.friendliness),
            recommendation: Number(data.stats.recommendation),
          }
        : null,
      ratings: data.ratings.map((r) => ({
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
    unstable_rethrow(err);
    logger.error('coach_rating:admin_get_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return null;
  }
}
