"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";

const logger = createLogger('student');

export interface PerformanceWordSummary {
  content_id: string;
  training_date: string;
  word_count: number;
  phrase_count: number;
  assessment_count: number;
  update_date: string;
  content_name: string;
}

export interface PerformanceSprintSession {
  self_sprint_id: string;
  content_id: string;
  total_answered: number;
  insert_date: string;
  assessment_count: number;
}

export interface PerformanceSprintDrill {
  summary_id: string;
  content_id: string;
  training_date: string;
  question_count: number;
  assessment_count: number;
}

export interface UserTrainingPerformanceResponse {
  words: PerformanceWordSummary[];
  sprint_sessions: PerformanceSprintSession[];
  sprint_drills: PerformanceSprintDrill[];
}

/**
 * ログイン中ユーザーの特定月のトレーニング実績を一括取得する (RPC経由)
 * @param yearMonth 'YYYY-MM' 形式の文字列
 */
export async function getUserTrainingPerformanceAction(yearMonth: string): Promise<{ success: boolean; data: UserTrainingPerformanceResponse; error?: string }> {
  const ctx = await getLogContext();
  logger.info("performance:get_user_performance_start", "Fetching user performance data via RPC", { ...ctx, yearMonth });

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { data, error } = await supabase.rpc('get_user_training_performance', {
      _year_month: yearMonth
    });

    if (error) throw error;

    const resData: UserTrainingPerformanceResponse = {
      words: data?.words || [],
      sprint_sessions: data?.sprint_sessions || [],
      sprint_drills: data?.sprint_drills || []
    };

    logger.info("performance:get_user_performance_success", `Fetched user performance data: ${resData.words.length} words, ${resData.sprint_sessions.length} sessions`, ctx);
    return { success: true, data: resData };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("performance:get_user_performance_error", "Failed to fetch user performance data", {
      ...ctx,
      payload: { error: message }
    });
    return { 
      success: false, 
      data: { words: [], sprint_sessions: [], sprint_drills: [] }, 
      error: message 
    };
  }
}

/** 通算のトレーニング実績（student_m_training_lifetime_stats。トレーニング実施時にDB側で更新される） */
export interface TrainingLifetimeStats {
  total_active_days: number;
  /** 最終実施日時点の連続日数。表示時は last_training_date から途切れていないかを判定すること */
  current_streak_days: number;
  /** 利用者のタイムゾーン基準のローカル日付（YYYY-MM-DD） */
  last_training_date: string | null;
  total_words: number;
  total_phrases: number;
  total_assessments: number;
}

/**
 * ログイン中ユーザーの通算トレーニング実績を取得する（未実施の場合は null）。
 * 本人の行のみ参照可能な RLS のため、テーブルを直接参照する。
 */
export async function getMyTrainingLifetimeStats(): Promise<TrainingLifetimeStats | null> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { data, error } = await supabase
      .from('student_m_training_lifetime_stats')
      .select('total_active_days, current_streak_days, last_training_date, total_words, total_phrases, total_assessments')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    logger.error("performance:get_lifetime_stats_error", "Failed to fetch training lifetime stats", {
      ...ctx,
      payload: { error: error instanceof Error ? error.message : String(error) }
    });
    // ホームの補助表示のため、失敗時は「実績なし」と同じ扱いにして画面全体は表示させる
    return null;
  }
}
