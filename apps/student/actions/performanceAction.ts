"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { createLogger, getLogContext } from "@gabby/lib/logger";

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

  } catch (error: any) {
    logger.error("performance:get_user_performance_error", "Failed to fetch user performance data", {
      ...ctx,
      payload: { error: error.message }
    });
    return { 
      success: false, 
      data: { words: [], sprint_sessions: [], sprint_drills: [] }, 
      error: error.message 
    };
  }
}
